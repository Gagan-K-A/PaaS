# 🖨️ PaaS — Printer as a Service

An IoT-enabled, autonomous, walk-up, authentication-free printing kiosk system. Upload a PDF, pay via UPI/Card, and print instantly — no login, no cash, no queues. 

Inspired by self-service vending systems, PaaS combines cloud infrastructure, payment gateways, and edge computing (Raspberry Pi) to automate the entire campus printing workflow.

---

## 🔗 Live Demo

* **Frontend:** [https://paas-frontend.vercel.app](https://paas-frontend.vercel.app)
* **Backend API:** [https://paas-backend.onrender.com](https://paas-backend.onrender.com)
* **API Docs (Swagger UI):** `https://paas-backend.onrender.com/docs`

> ⚠️ **Note:** The physical printing component requires the Raspberry Pi edge device to be online. Since this is a prototype/demo, the Pi may not always be connected.

---

## 📋 Table of Contents

* [Problem Statement](#-problem-statement)
* [System Architecture](#-system-architecture)
* [Tech Stack](#-tech-stack)
* [Features](#-features)
* [How It Works](#-how-it-works)
* [Project Structure](#-project-structure)
* [Setup & Installation](#-setup--installation)
* [Environment Variables](#-environment-variables)
* [API Endpoints](#-api-endpoints)
* [Hardware Setup (Raspberry Pi)](#-hardware-setup-raspberry-pi)
* [Known Limitations](#-known-limitations)
* [Future Work](#-future-work)
* [License](#-license)

---

## 🎯 Problem Statement

Traditional campus printing shops suffer from:
* Long queues during peak submission and exam periods
* Manual cash handling — slow and error-prone
* Frequent printer breakdowns with no fault detection
* USB-based file transfer — high security/malware risk
* Limited availability after college hours

**PaaS solves this** by providing a fully autonomous, digital-payment-enabled, 24×7 accessible printing kiosk.

---

## 🏗️ System Architecture

```text
┌─────────────────────────┐
│     React Frontend      │  (Vercel)
│   Upload → Pay → Vend   │
└────────────┬────────────┘
             │ REST API
             ▼
┌─────────────────────────┐
│     FastAPI Backend     │  (Render)
│   Order + Payment Logic │
└──────┬───────────┬──────┘
       │           │
       ▼           ▼
┌─────────────┐ ┌──────────────┐
│ Cloudinary  │ │   Razorpay   │
│(File Storage│ │(UPI/Card Pay)│
└─────────────┘ └──────────────┘
       │
       │ On Verified Payment
       ▼
┌─────────────────────────┐
│     Raspberry Pi 4      │  (Edge Device via ngrok)
│     FastAPI + CUPS      │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│    Physical Printer     │
│  (HP DeskJet 2135)      │
└─────────────────────────┘


---

🛠️ Tech Stack

Layer,Technology
Frontend,React (Vite)
Backend,FastAPI (Python)
File Storage,Cloudinary
Payment Gateway,Razorpay (UPI / Card)
Edge Device,Raspberry Pi 4 (4GB)
Printing System,CUPS (Common Unix Printing System)
Edge-to-Cloud Tunnel,ngrok
Frontend Hosting,Vercel
Backend Hosting,Render

---

## ✨ Features

- 📤 **PDF Upload** — Simple drag-and-drop/file-select interface
- 💳 **UPI/Card Payment** — Secure payment via Razorpay with HMAC signature verification
- 🚫 **No Login Required** — Fully anonymous, session-based like a real vending machine
- 🖨️ **Automatic Printing** — Verified payment directly triggers physical print job
- ☁️ **Cloud-Native** — Frontend and backend fully deployed and publicly accessible
- 🔐 **Secure API Communication** — API key authentication between backend and edge device
- 🗑️ **Privacy-First** — Uploaded files are deleted after successful print job

---

## ⚙️ How It Works

1. User visits the website and uploads a PDF document
2. Backend stores the file temporarily in Cloudinary and creates a Razorpay order
3. User completes payment via Razorpay Checkout (UPI/Card)
4. Backend verifies the payment using HMAC-SHA256 signature validation
5. User clicks **"Vend / Print Now"**
6. Backend retrieves the file from Cloudinary and forwards it to the Raspberry Pi's API (via ngrok tunnel)
7. Raspberry Pi sends the file to the connected printer using CUPS
8. Physical document is printed and ready for collection
9. Uploaded file is deleted from storage post-print for privacy

---

## 📁 Project Structure

paas-project/
├── frontend/ # React (Vite) application
│ ├── src/
│ │ ├── App.jsx # Main upload/payment/vend logic
│ │ └── App.css
│ ├── index.html # Includes Razorpay checkout script
│ ├── .env # VITE_BACKEND_URL
│ └── package.json
│
├── backend/ # FastAPI application
│ ├── main.py # Upload, payment, verify, vend endpoints
│ ├── requirements.txt
│ └── .env # API keys (not committed)
│
└── pi/ # Raspberry Pi edge device app
├── app.py # FastAPI app for print job execution
└── uploads/ # Temporary file storage on Pi

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js v18+
- Python 3.9+
- Raspberry Pi 4 with Raspberry Pi OS
- USB Printer (CUPS-compatible)
- Razorpay account (Test Mode)
- Cloudinary account

