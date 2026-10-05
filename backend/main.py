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
import io
from pypdf import PdfReader
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
PI_API_URL = os.getenv("PI_API_URL")
PI_API_KEY = os.getenv("PI_API_KEY")

PRICE_PER_PAGE = int(os.getenv("PRICE_PER_PAGE", 300))

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)

razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

orders = {}


class VerifyPaymentRequest(BaseModel):
    order_id: str
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


class VendRequest(BaseModel):
    order_id: str
    simulate_jam: bool = False  # Optional flag for easy teacher demo!


@app.get("/")
def home():
    return {"message": "PaaS Backend is running"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_bytes = await file.read()

    try:
        pdf_reader = PdfReader(io.BytesIO(file_bytes))
        page_count = len(pdf_reader.pages)
        if page_count == 0:
            raise HTTPException(status_code=400, detail="PDF file is empty")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

    total_amount = page_count * PRICE_PER_PAGE

    try:
        result = cloudinary.uploader.upload(
            file_bytes, resource_type="raw", folder="paas_uploads"
        )
        file_url = result["secure_url"]
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Cloudinary upload failed: {str(e)}"
        )

    order_id = str(uuid.uuid4())

    try:
        razorpay_order = razorpay_client.order.create(
            {"amount": total_amount, "currency": "INR", "payment_capture": 1}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay order failed: {str(e)}")

    orders[order_id] = {
        "file_url": file_url,
        "filename": file.filename,
        "page_count": page_count,
        "razorpay_order_id": razorpay_order["id"],
        "amount": total_amount,
        "paid": False,
        "razorpay_payment_id": None,
    }

    return {
        "order_id": order_id,
        "razorpay_order_id": razorpay_order["id"],
        "amount": total_amount,
        "page_count": page_count,
        "key_id": RAZORPAY_KEY_ID,
    }


@app.post("/verify-payment")
async def verify_payment(data: VerifyPaymentRequest):
    order = orders.get(data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    generated_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if generated_signature != data.razorpay_signature:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    order["paid"] = True
    order["razorpay_payment_id"] = (
        data.razorpay_payment_id
    )  # Saved for potential refund!
    return {"status": "verified"}


@app.post("/vend")
async def vend(data: VendRequest):
    order = orders.get(data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order["paid"]:
        raise HTTPException(status_code=403, detail="Payment not verified")

    # ---- Optional Simulation for Teacher Demo ----
    if data.simulate_jam:
        return trigger_auto_refund(
            order, "Simulated Hardware Fault: Paper Jam / Out of Ink detected on kiosk!"
        )

    # Fetch file from Cloudinary
    try:
        file_response = requests.get(order["file_url"])
        file_response.raise_for_status()
    except Exception as e:
        return trigger_auto_refund(order, f"Storage retrieval error: {str(e)}")

    # Send print command to Pi
    try:
        pi_response = requests.post(
            PI_API_URL,
            headers={"X-API-KEY": PI_API_KEY, "ngrok-skip-browser-warning": "true"},
            files={"file": (order["filename"], file_response.content)},
            timeout=20,  # If Pi/printer hangs, timeout and refund!
        )
        pi_response.raise_for_status()
    except Exception as e:
        # PRINTER / PI FAILURE -> AUTOMATIC REFUND!
        error_msg = "Printer Fault (Paper Jam, Ink Error, or Offline)"
        if hasattr(e, "response") and e.response is not None:
            try:
                error_msg = e.response.json().get("detail", error_msg)
            except:
                pass
        return trigger_auto_refund(order, error_msg)

    del orders[data.order_id]
    return {"status": "success", "message": "Print job sent successfully!"}


def trigger_auto_refund(order: dict, failure_reason: str):
    """Helper function to issue a Razorpay refund when hardware fails."""
    payment_id = order.get("razorpay_payment_id")
    refund_info = ""

    if payment_id:
        try:
            # Call Razorpay Refund API
            refund = razorpay_client.payment.refund(payment_id, order["amount"])
            refund_info = f"Amount of ₹{order['amount']/100} has been automatically refunded to your payment method (Refund ID: {refund['id']})."
        except Exception as ref_err:
            refund_info = f"Automatic refund attempt error: {str(ref_err)}."
    else:
        refund_info = "Payment ID not found for refund."

    raise HTTPException(
        status_code=500, detail=f"⚠️ Print Failed: {failure_reason}. {refund_info}"
    )
