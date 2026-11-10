# ProtoNex — Digital Fabrication & CAD Quote Automation
> **College Project Edition: CAD File Upload, Geometry-Aware Instant Quoting, and Order Email Dispatch with CAD File Attachment.**

---

## 🎓 1. Project Overview & Objectives

ProtoNex is a full-stack digital fabrication web platform designed for prototyping labs, maker spaces, and engineering college workshops. It automates the workflow from 3D CAD design upload to instant manufacturing quote generation and automated order dispatch:

1. **CAD File Upload**: Supports 3D geometry files (`.stl`, `.obj`, `.3mf`) and 2D profiles (`.step`, `.stp`, `.dxf`).
2. **Instant Geometry Analysis**: Calculates real-time 3D dimensions (X × Y × Z in mm), volume displacement (cm³), surface area (cm²), and mesh facet count.
3. **Dynamic Manufacturing Quoting**: Computes realistic production costs based on:
   - Manufacturing Process (3D Printing - FDM / SLA / SLS; Metal Cutting - Laser / Waterjet / Plasma)
   - Material Selection (PLA, ABS, PETG, Resin, SLS Nylon, Aluminum 6061-T6, Stainless Steel 304, Mild Steel, Brass)
   - Volume, density, machine runtime, setup calibration, surface finish, and quantity discounts.
4. **Automated Email Dispatch with Attached CAD File**: When an order is placed, an email is dispatched containing:
   - Complete itemized financial quote breakdown.
   - Manufacturing and tooling specifications.
   - **The exact uploaded CAD file attached directly** to the email for the workshop fabrication queue.
   - Clickable preview link powered by Nodemailer & Ethereal test inbox (or custom Gmail/college SMTP).

---

## 🛠️ 2. System Architecture

```mermaid
flowchart TD
    Client["Browser Client (HTML5 / CSS3 / Vanilla JS)"]
    API["Express.js Server (Node.js & TypeScript)"]
    GeometryEngine["Pure TS Geometry Engine (Mesh Volume & Envelope)"]
    PricingEngine["Manufacturing Pricing Engine (Material & Machine Rates)"]
    LocalStorage["Local File Storage (backend/uploads/)"]
    JSONDB["Persistent JSON Database (backend/data/database.json)"]
    Mailer["Nodemailer Service (Ethereal / Gmail SMTP)"]
    Recipient["Customer Inbox (Receives Order Details + CAD Attachment)"]

    Client -->|1. Upload CAD Model (.stl / .obj / .step)| API
    API -->|Save to disk| LocalStorage
    API -->|Parse geometry| GeometryEngine
    GeometryEngine -->|Volume, Envelope, Triangles| PricingEngine
    PricingEngine -->|Itemized Quote Breakdown| API
    API -->|Live Quote & Geometry| Client
    Client -->|2. Confirm Order & Place Request| API
    API -->|Store Order & Quote| JSONDB
    API -->|3. Generate Email with CAD File Attached| Mailer
    Mailer -->|4. Deliver Confirmation Email + Attachment| Recipient
```

---

## 🚀 3. How to Run the Project

### Prerequisites
- Node.js (version 18 or higher)
- npm

### Quick Start (Single Command)

From the project root directory:

```bash
# 1. Install dependencies (if not already installed)
npm install --prefix backend

# 2. Run the application
npm run dev
```

The application will start immediately at:
👉 **`http://localhost:8787`**

- **Frontend Website**: `http://localhost:8787/index.html`
- **Dashboard Workspace**: `http://localhost:8787/dashboard.html`
- **API Health Check**: `http://localhost:8787/api/health`

---

## 📧 4. Email Configuration & Verification

ProtoNex is designed to work **100% out-of-the-box with zero configuration**:

### Mode A: Automatic Free Test Inbox (Default - Perfect for College Viva & Demos)
- If `.env` has no SMTP settings, ProtoNex automatically creates an **Ethereal test account**.
- When an order is placed:
  1. The email is sent and a **clickable preview link** (e.g. `https://ethereal.email/message/...`) is printed in the server terminal.
  2. The web UI displays an **"Order Placed Successfully"** popup with a **"View Sent Email Preview ↗"** button that lets you view the full email with attachment info right in the browser!

### Mode B: Real Gmail / Outlook / College SMTP
To send real emails to your personal inbox, open `backend/.env` and enter your credentials:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_digit_app_password
SMTP_FROM="ProtoNex Fabrication <quotes@protonex.local>"
```
*(For Gmail, create an App Password under Google Account > Security > 2-Step Verification > App passwords).*

---

## 🧮 5. Manufacturing Quote Calculation Formula

ProtoNex uses realistic manufacturing engineering formulas:

1. **Part Weight ($W$ in grams)**:
   $$W = \text{Volume (cm}^3\text{)} \times \text{Material Density (g/cm}^3\text{)}$$
2. **Raw Material Cost**:
   $$\text{Material Cost} = W \times \text{Rate per Gram} \times \text{Quantity}$$
3. **Machine Runtime Cost**:
   $$\text{Machine Cost} = \text{Estimated Machine Hours} \times \text{Machine Hourly Rate} \times \text{Quantity}$$
4. **Setup & Calibration Fee**:
   $$\text{Setup Cost} = \text{Base Setup Fee} + (\text{Quantity} \times 15)$$
5. **Finishing Cost**:
   $$\text{Finishing Cost} = \text{Finish Rate per Part} \times \text{Quantity}$$
6. **Commercial Subtotal & Taxes**:
   $$\text{Subtotal} = (\text{Material} + \text{Machine} + \text{Setup} + \text{Finish}) - \text{Bulk Discount} + \text{Rush Surcharge}$$
   $$\text{GST / Taxes (18\%)} = \text{Subtotal} \times 0.18$$
   $$\text{Total Invoice Quote} = \text{Subtotal} + \text{Tax}$$

---

## 📂 6. Project Directory Structure

```
protonex/
├── backend/
│   ├── data/
│   │   └── database.json          # Persistent local database (JSON format)
│   ├── dist/                      # Compiled production JavaScript
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts             # Environment & server settings
│   │   ├── db/
│   │   │   └── db.ts              # File-based database manager (CRUD)
│   │   ├── routes/
│   │   │   └── api.routes.ts      # REST API (upload, quote, orders, files)
│   │   ├── services/
│   │   │   ├── geometryEngine.ts  # STL/OBJ geometry analysis (volume, dims, facets)
│   │   │   ├── pricingEngine.ts   # Geometry-aware quoting formulas
│   │   │   └── mailerService.ts   # Nodemailer email dispatcher with CAD attachment
│   │   ├── app.ts                 # Express application setup & static serving
│   │   └── index.ts               # Server entry point
│   ├── uploads/                   # Stored uploaded CAD models
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── index.html                 # Main landing page with Instant Quote Modal
│   ├── dashboard.html             # Customer workspace (Projects, Quotes, Files, Orders)
│   ├── script.js                  # Frontend interactive controller & live quoting
│   ├── dashboard.js               # Dashboard tabs and order tracking
│   ├── api-client.js              # Fetch client wrapper
│   └── styles.css                 # Dark theme responsive styles
│
├── sample_cad_files/
│   └── mounting_bracket.stl       # Ready-to-test CAD model for demonstration
│
└── package.json                   # Root convenience scripts
```

---

## 🧪 7. Testing the Entire Flow

A test script is included in `backend/test_flow.js`:

```bash
cd backend
node test_flow.js
```

This verifies:
1. STL binary/ASCII parser accuracy (dimensions, volume in cm³).
2. Quote breakdown calculation.
3. Nodemailer dispatch with `mounting_bracket.stl` attached.
4. Ethereal preview link generation.

---

## 🏆 Viva / Evaluation Highlights

- **Zero Third-Party Cloud Bottlenecks**: Runs without Docker, PostgreSQL, Redis, or paid S3/Resend accounts.
- **Pure Node.js STL Parsing**: Uses the mathematical signed volume of tetrahedra for accurate volume calculation without external C++ CAD packages.
- **Guaranteed Email Delivery Verification**: Generates real email records and interactive web preview links with attached CAD models.
- **Modern Responsive UI**: Clean dark theme with live cost breakdown, turnaround estimation, and direct CAD downloading.
