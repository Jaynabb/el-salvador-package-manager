# 📦 ImportFlow - El Salvador Package Import Manager

A comprehensive package tracking and customs management system built for import businesses in El Salvador. Features AI-powered package scanning, automatic customs duty calculation, SMS notifications, and Google Sheets CRM integration.

## 🌟 Features

### Core Functionality
- **📸 AI Package Scanning** - Scan shipping labels and invoices to automatically extract:
  - Tracking numbers
  - Package contents and values
  - Customer information
  - Origin and carrier details

- **📊 Dashboard** - Real-time overview of:
  - Package statuses (Received, In Customs, Ready for Pickup, Delivered)
  - Total package value in warehouse
  - Pending payments
  - Daily statistics

- **💰 Automatic Duty Calculation** - Based on El Salvador customs regulations:
  - Packages under $300 USD: Exempt from import tariffs, 13% VAT only
  - Packages over $300 USD: Import duties + 13% VAT
  - HS Code support for accurate duty rates

- **📱 SMS Notifications** - Automatic customer notifications for:
  - Package received
  - Customs cleared
  - Ready for pickup
  - Delivered

- **📝 Google Sheets Integration** - Export package and customer data to CSV for CRM

- **📦 Package Management** - Full CRUD operations with:
  - Status tracking
  - Payment status
  - Activity logs
  - Customs documentation

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm
- Firebase account (for database)
- Google Gemini API key (for AI scanning)
- (Optional) Twilio account (for SMS)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Jaynabb/el-salvador-package-manager.git
   cd el-salvador-package-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env.local` and fill in your credentials:
   ```bash
   cp .env.example .env.local
   ```

   Required variables:
   - `VITE_FIREBASE_*` - Firebase configuration
   - `VITE_GEMINI_API_KEY` - Google Gemini AI API key

   Optional:
   - `VITE_TWILIO_*` - For SMS notifications (currently mock)
   - `VITE_GOOGLE_SHEETS_*` - For direct Google Sheets API integration

4. **Set up Firebase**
   - Create a Firebase project at [https://console.firebase.google.com](https://console.firebase.google.com)
   - Enable Firestore Database
   - Copy your Firebase config to `.env.local`

5. **Get Google Gemini API Key**
   - Visit [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
   - Create an API key
   - Add to `.env.local` as `VITE_GEMINI_API_KEY`

6. **Run the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## 📱 Usage

### Scanning Packages

1. Click **"📸 Scan Package"**
2. Take a photo or upload an image of the shipping label
3. Click **"🔍 Analyze with AI"**
4. Review and edit the extracted information
5. Add customer details
6. Save - the customer will automatically receive an SMS notification

### Managing Packages

1. Navigate to **"📦 All Packages"**
2. Use search and filters to find packages
3. Update status using the dropdown
4. Mark payments as paid/unpaid
5. Expand package details to view items and customs info

### Viewing Dashboard

- **📊 Dashboard** shows real-time statistics
- **Export to CSV** to download all package data for Google Sheets

## 🏗️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **AI**: Google Gemini 1.5 Flash
- **PDF Processing**: PDF.js
- **SMS**: Twilio (backend integration required)

## 📋 El Salvador Customs Regulations

The system automatically calculates customs duties based on current El Salvador regulations:

- **Personal packages under $300 USD**:
  - ✅ Exempt from import tariffs
  - 📊 13% VAT applies

- **Packages over $300 USD**:
  - 📊 Import duty (varies by HS code, default 15%)
  - 📊 13% VAT on (declared value + import duty)

- **Required documentation**:
  - Customs declaration
  - Commercial invoice
  - Transportation documents (airway bill / bill of lading)
  - Certificate of origin
  - HS Code (Harmonized System Code)

## 🔧 Configuration

### Firebase Firestore Collections

The app uses these Firestore collections:
- `packages` - Package records
- `customers` - Customer information
- `activityLogs` - Activity tracking
- `smsNotifications` - SMS notification history

### SMS Integration

Currently, SMS notifications are logged to Firestore but not actually sent. For production:

1. Set up a backend API (Firebase Functions, Express, etc.)
2. Integrate with Twilio or another SMS provider
3. Update `src/services/smsService.ts` to call your backend API

### Google Sheets Integration

CSV export is currently supported. For direct Google Sheets API integration:

1. Enable Google Sheets API in Google Cloud Console
2. Create OAuth 2.0 credentials
3. Implement the API calls in `src/services/googleSheetsService.ts`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this for your import business!

## 🙏 Credits

Built with Claude Code by ImportFlow

---

**Made for El Salvador import businesses** 🇸🇻
