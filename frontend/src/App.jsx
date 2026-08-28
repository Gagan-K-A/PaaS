import { useState } from "react";
import axios from "axios";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [orderId, setOrderId] = useState(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setStatus("");
    setPaymentDone(false);
    setOrderId(null);
  };

  const handleUploadAndPay = async () => {
    if (!file) {
      alert("Please select a PDF file first");
      return;
    }

    if (file.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      return;
    }

    setLoading(true);
    setStatus("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await axios.post(`${BACKEND_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = uploadRes.data;
      setOrderId(data.order_id);
      setStatus("Opening payment gateway...");

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: "INR",
        name: "PaaS - Printer as a Service",
        description: "Print Job Payment",
        order_id: data.razorpay_order_id,
        handler: async function (response) {
          setStatus("Verifying payment...");

          try {
            await axios.post(`${BACKEND_URL}/verify-payment`, {
              order_id: data.order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            setPaymentDone(true);
            setStatus("✅ Payment verified! Click Vend to print your document.");
          } catch (err) {
            setStatus("❌ Payment verification failed: " + (err.response?.data?.detail || err.message));
          }
        },
        modal: {
          ondismiss: function () {
            setStatus("Payment cancelled.");
            setLoading(false);
          },
        },
        theme: { color: "#2563eb" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setStatus("❌ Upload failed: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleVend = async () => {
    if (!orderId || !paymentDone) {
      alert("Complete payment first");
      return;
    }

    setLoading(true);
    setStatus("Sending to printer...");

    try {
      const res = await axios.post(`${BACKEND_URL}/vend`, { order_id: orderId });
      setStatus("🖨️ " + res.data.message);
      setPaymentDone(false);
      setOrderId(null);
      setFile(null);
    } catch (err) {
      setStatus("❌ Vend failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>🖨️ PaaS — Printer as a Service</h1>
      <p className="subtitle">Upload your PDF, pay, and print instantly</p>

      <div className="card">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={loading || paymentDone}
        />

        {!paymentDone && (
          <button onClick={handleUploadAndPay} disabled={loading || !file}>
            {loading ? "Processing..." : "Upload & Pay"}
          </button>
        )}

        {paymentDone && (
          <button className="vend-btn" onClick={handleVend} disabled={loading}>
            {loading ? "Printing..." : "🖨️ Vend / Print Now"}
          </button>
        )}

        {status && <p className="status">{status}</p>}
      </div>
    </div>
  );
}

export default App;