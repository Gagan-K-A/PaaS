import { useState } from "react";
import axios from "axios";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type: 'info'|'success'|'error', text: '' }
  const [orderData, setOrderData] = useState(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [simulateJam, setSimulateJam] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // File Selection Handlers
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (selectedFile.type !== "application/pdf") {
      setStatus({ type: "error", text: "Invalid file type. Only PDF documents are supported." });
      return;
    }
    setFile(selectedFile);
    setStatus(null);
    setPaymentDone(false);
    setOrderData(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // STEP 1: Upload & Calculate
  const handleUploadAndCalculate = async () => {
    if (!file) return;

    setLoading(true);
    setStatus({ type: "info", text: "Analyzing PDF pages and generating secure order..." });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await axios.post(`${BACKEND_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = uploadRes.data;
      setOrderData(data);
      setStatus({ type: "success", text: "File processed successfully! Review your summary below." });
    } catch (err) {
      setStatus({
        type: "error",
        text: "Upload failed: " + (err.response?.data?.detail || err.message),
      });
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Razorpay Payment
  const handleOpenRazorpay = () => {
    if (!orderData) return;

    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: "INR",
      name: "PaaS - Self-Service Kiosk",
      description: `Printing ${orderData.page_count} Page(s)`,
      order_id: orderData.razorpay_order_id,
      handler: async function (response) {
        setStatus({ type: "info", text: "Verifying cryptographic payment signature..." });
        setLoading(true);

        try {
          await axios.post(`${BACKEND_URL}/verify-payment`, {
            order_id: orderData.order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });

          setPaymentDone(true);
          setStatus({
            type: "success",
            text: "Payment Authenticated! Click 'Vend / Print Document' to execute print job.",
          });
        } catch (err) {
          setStatus({
            type: "error",
            text: "Payment verification failed: " + (err.response?.data?.detail || err.message),
          });
        } finally {
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          setStatus({ type: "info", text: "Payment session cancelled by user." });
        },
      },
      theme: { color: "#4f46e5" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  // STEP 3: Vend / Print Execution
  const handleVend = async () => {
    if (!orderData || !paymentDone) return;

    setLoading(true);
    setStatus({ type: "info", text: "Transmitting print payload to Raspberry Pi Edge Node..." });

    try {
      const res = await axios.post(`${BACKEND_URL}/vend`, {
        order_id: orderData.order_id,
        simulate_jam: simulateJam,
      });

      setStatus({ type: "success", text: "🖨️ " + res.data.message });
      setPaymentDone(false);
      setOrderData(null);
      setFile(null);
    } catch (err) {
      const errorDetail = err.response?.data?.detail || err.message;
      setStatus({ type: "error", text: errorDetail });
    } finally {
      setLoading(false);
    }
  };

  // Determine current active step (1, 2, or 3)
  const currentStep = paymentDone ? 3 : orderData ? 2 : 1;

  return (
    <div className="kiosk-body">
      {/* Background Glow Overlay */}
      <div className="bg-glow"></div>

      <div className="kiosk-container">
        {/* Kiosk Header */}
        <header className="kiosk-header">
          <div className="brand flex-center">
            <div className="logo-icon">🖨️</div>
            <div>
              <h1 className="brand-title">Printer-as-a-Service</h1>
              <p className="brand-subtitle">Printer-as-a-Service Kiosk Network</p>
            </div>
          </div>
        </header>

        {/* Workflow Stepper */}
        <div className="stepper-bar">
          <div className={`step-item ${currentStep >= 1 ? "active" : ""}`}>
            <div className="step-badge">1</div>
            <span className="step-label">Select Document</span>
          </div>
          <div className={`step-line ${currentStep >= 2 ? "active" : ""}`}></div>
          <div className={`step-item ${currentStep >= 2 ? "active" : ""}`}>
            <div className="step-badge">2</div>
            <span className="step-label">Review & Pay</span>
          </div>
          <div className={`step-line ${currentStep >= 3 ? "active" : ""}`}></div>
          <div className={`step-item ${currentStep >= 3 ? "active" : ""}`}>
            <div className="step-badge">3</div>
            <span className="step-label">Instant Vend</span>
          </div>
        </div>

        {/* Main Content Card */}
        <main className="kiosk-card">
          {/* File Upload Dropzone */}
          {!orderData && !paymentDone && (
            <div
              className={`dropzone ${isDragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="file-input"
                accept="application/pdf"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                disabled={loading}
                className="hidden-file-input"
              />
              <label htmlFor="file-input" className="dropzone-content">
                <div className="upload-icon-wrapper">📄</div>
                {file ? (
                  <div className="file-info-preview">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <span className="change-file-link">Click or drag to change file</span>
                  </div>
                ) : (
                  <div>
                    <h3 className="dropzone-title">Drop your PDF file here</h3>
                    <p className="dropzone-desc">or click to browse from device</p>
                    <span className="badge-pill">PDF format only</span>
                  </div>
                )}
              </label>
            </div>
          )}

          {/* Order Receipt Summary */}
          {orderData && (
            <div className="receipt-card">
              <div className="receipt-header">
                <span className="receipt-title">Order Summary</span>
                <span className="receipt-tag">Order #{orderData.order_id.slice(0, 8)}</span>
              </div>
              <div className="receipt-body">
                <div className="receipt-row">
                  <span>Document Name</span>
                  <span className="font-semibold text-truncate">{file?.name}</span>
                </div>
                <div className="receipt-row">
                  <span>Detected Pages</span>
                  <span className="font-semibold">{orderData.page_count} Pages</span>
                </div>
                <div className="receipt-row">
                  <span>Printing Rate</span>
                  <span>₹3.00 / page</span>
                </div>
                <div className="receipt-divider"></div>
                <div className="receipt-row total-row">
                  <span>Total Amount Due</span>
                  <span className="total-amount">₹{orderData.amount / 100}</span>
                </div>
              </div>
            </div>
          )}

          {/* Status Banners */}
          {status && (
            <div className={`status-banner ${status.type}`}>
              <div className="status-icon">
                {status.type === "error" ? "⚠️" : status.type === "success" ? "✅" : "ℹ️"}
              </div>
              <div className="status-text">{status.text}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="action-area">
            {!orderData && !paymentDone && (
              <button
                className="btn btn-primary"
                onClick={handleUploadAndCalculate}
                disabled={loading || !file}
              >
                {loading ? (
                  <span className="flex-center gap-2">
                    <span className="spinner"></span> Analyzing PDF Pages...
                  </span>
                ) : (
                  "Upload & Analyze Document ➔"
                )}
              </button>
            )}

            {orderData && !paymentDone && (
              <button className="btn btn-success" onClick={handleOpenRazorpay} disabled={loading}>
                {loading ? (
                  <span className="flex-center gap-2">
                    <span className="spinner"></span> Opening Payment Gateway...
                  </span>
                ) : (
                  `Pay ₹${orderData.amount / 100} Now 🔒`
                )}
              </button>
            )}

            {paymentDone && (
              <button className="btn btn-vend" onClick={handleVend} disabled={loading}>
                {loading ? (
                  <span className="flex-center gap-2">
                    <span className="spinner"></span> Executing Print Job...
                  </span>
                ) : (
                  "🖨️ Vend / Print Document Now"
                )}
              </button>
            )}
          </div>

          {/* Teacher Demo Fault Simulator Toggle */}
          <div className="demo-toggle-wrapper">
            <label className="demo-toggle-label">
              <input
                type="checkbox"
                checked={simulateJam}
                onChange={(e) => setSimulateJam(e.target.checked)}
              />
              <span className="demo-toggle-text">
                🧪 <strong>Evaluation Mode:</strong> Simulate Printer Jam / Fault (Triggers Auto-Refund)
              </span>
            </label>
          </div>
        </main>

        {/* Footer */}
        <footer className="kiosk-footer">
         
        </footer>
      </div>
    </div>
  );
}

export default App;