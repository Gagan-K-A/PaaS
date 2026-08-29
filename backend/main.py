from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cloudinary
import cloudinary.uploader
import razorpay
import requests
import hmac
import hashlib
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Allow requests from your React frontend (any origin for now, restrict later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Configuration from .env ----
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
PI_API_URL = os.getenv("PI_API_URL")
PI_API_KEY = os.getenv("PI_API_KEY")
FLAT_FEE = int(os.getenv("FLAT_FEE", 1000))

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)

razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# ---- In-memory order storage (fine for demo) ----
orders = {}


# ---- Request Models ----
class VerifyPaymentRequest(BaseModel):
    order_id: str
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


class VendRequest(BaseModel):
    order_id: str


# ---- Routes ----


@app.get("/")
def home():
    return {"message": "PaaS Backend is running"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Upload to Cloudinary
    try:
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="raw",  # raw = for non-image files like PDFs
            folder="paas_uploads",
        )
        file_url = result["secure_url"]
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Cloudinary upload failed: {str(e)}"
        )

    # Create internal order ID
    order_id = str(uuid.uuid4())

    # Create Razorpay order
    try:
        razorpay_order = razorpay_client.order.create(
            {"amount": FLAT_FEE, "currency": "INR", "payment_capture": 1}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay order failed: {str(e)}")

    orders[order_id] = {
        "file_url": file_url,
        "filename": file.filename,
        "razorpay_order_id": razorpay_order["id"],
        "amount": FLAT_FEE,
        "paid": False,
    }

    return {
        "order_id": order_id,
        "razorpay_order_id": razorpay_order["id"],
        "amount": FLAT_FEE,
        "key_id": RAZORPAY_KEY_ID,
    }


@app.post("/verify-payment")
async def verify_payment(data: VerifyPaymentRequest):
    order = orders.get(data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verify signature (CRITICAL for real security)
    generated_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if generated_signature != data.razorpay_signature:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    order["paid"] = True
    return {"status": "verified"}


@app.post("/vend")
async def vend(data: VendRequest):
    order = orders.get(data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order["paid"]:
        raise HTTPException(status_code=403, detail="Payment not verified")

    # Download file from Cloudinary, then forward to Pi
    try:
        file_response = requests.get(order["file_url"])
        file_response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch file: {str(e)}")

    try:
        pi_response = requests.post(
            PI_API_URL,
            headers={"X-API-KEY": PI_API_KEY},
            files={"file": (order["filename"], file_response.content)},
        )
        pi_response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Printer service error: {str(e)}")

    # Clean up order after successful print
    del orders[data.order_id]

    return {"status": "success", "message": "Print job sent successfully"}

