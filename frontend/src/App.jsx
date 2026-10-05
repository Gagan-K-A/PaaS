import { useState } from "react";
import axios from "axios";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [orderData, setOrderData] = useState(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [simulateJam, setSimulateJam] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setStatus("");
    setPaymentDone(false);
    setOrderData(null);
  };

  const handleUploadAndCalculate = async () => {
    if (!file) {
      alert("Please select a PDF file first");
      return;
    }

    if (file.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      return;
    }

    setLoading(true);
    setStatus("Analyzing PDF and calculating price...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await axios.post(`${BACKEND_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = uploadRes.data;
      setOrderData(data);
      setStatus("✅ File analyzed! Please review price summary.");
    } catch (err) {
      setStatus("❌ Upload failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRazorpay = () => {
    if (!orderData) return;

    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: "INR",
      name: "PaaS - Printer as a Service",
      description: `Print ${orderData.page_count} Page(s)`,
      order_id: orderData.razorpay_order_id,
      handler: async function (response) {
        setStatus("Verifying payment...");
        setLoading(true);

        try {
          await axios.post(`${BACKEND_URL}/verify-payment`, {
            order_id: orderData.order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });

          setPaymentDone(true);
          setStatus("✅ Payment verified! Click Vend to print your document.");
        } catch (err) {
          setStatus("❌ Payment verification failed: " + (err.response?.data?.detail || err.message));
        } finally {
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          setStatus("Payment cancelled.");
        },
      },
      theme: { color: "#2563eb" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const handleVend = async () => {
    if (!orderData || !paymentDone) {
      alert("Complete payment first");
      return;
    }

    setLoading(true);
    setStatus("Sending to printer...");

    try {
      const res = await axios.post(`${BACKEND_URL}/vend`, { 
        order_id: orderData.order_id,
        simulate_jam: simulateJam 
      });
      setStatus("🖨️ " + res.data.message);
      setPaymentDone(false);
      setOrderData(null);
      setFile(null);
    } catch (err) {
      // DONT reset order state on fail so user sees refund message clearly
      const errorDetail = err.response?.data?.detail || err.message;
      setStatus(errorDetail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>🖨️ PaaS — Printer as a Service</h1>
      <p className="subtitle">Upload your PDF, pay per page, and print instantly</p>

      <div className="card">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={loading || paymentDone || orderData}
        />

        {orderData && (
          <div style={{ margin: "20px 0", padding: "15px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", fontSize: "15px" }}>
            <p style={{ margin: "0 0 8px 0" }}>📄 Document: <strong>{file?.name}</strong></p>
            <p style={{ margin: "0 0 8px 0" }}>📄 Detected Pages: <strong>{orderData.page_count}</strong></p>
            <p style={{ margin: 0, fontSize: "18px", color: "#1e293b" }}>
              💰 Total Price: <strong style={{ color: "#16a34a" }}>₹{orderData.amount / 100}</strong> <span style={{ fontSize: "12px", color: "#64748b" }}>(@ ₹3/page)</span>
            </p>
          </div>
        )}

        {/* DEMO FEATURE: Teacher Simulation Toggle */}
        {paymentDone && (
          <div style={{ margin: "10px 0", fontSize: "13px", color: "#dc2626", background: "#fef2f2", padding: "8px", borderRadius: "6px" }}>
            <label style={{ cursor: "pointer" }}>
              <input 
                type="checkbox" 
                checked={simulateJam} 
                onChange={(e) => setSimulateJam(e.target.checked)} 
              />
              🧪 <strong>Demo Mode:</strong> Simulate Paper Jam / Out of Ink Fault
            </label>
          </div>
        )}

        {!orderData && !paymentDone && (
          <button onClick={handleUploadAndCalculate} disabled={loading || !file}>
            {loading ? "Analyzing PDF..." : "Upload & Calculate Price"}
          </button>
        )}

        {orderData && !paymentDone && (
          <button onClick={handleOpenRazorpay} disabled={loading} style={{ background: "#16a34a" }}>
            Pay ₹{orderData.amount / 100} Now
          </button>
        )}

        {paymentDone && (
          <button className="vend-btn" onClick={handleVend} disabled={loading}>
            {loading ? "Printing..." : "🖨️ Vend / Print Now"}
          </button>
        )}

        {status && (
          <div className="status" style={{ marginTop: "15px", textAlign: "left" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;