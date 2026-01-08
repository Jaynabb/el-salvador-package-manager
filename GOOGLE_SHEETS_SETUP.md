# 📊 Google Sheets Live Sync Setup Guide

This guide will help you set up **real-time synchronization** between ImportFlow and Google Sheets. Perfect for Make.com automation!

## 🎯 What You'll Get

- **Live updates** - Every package automatically appears in Google Sheets instantly
- **All data** - Customer info, package details, customs documents, fees, everything!
- **Make.com ready** - Trigger automations whenever a new row is added
- **No manual exports** - Completely automatic

---

## ⚡ Quick Setup (5 minutes)

### Step 1: Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a **new blank spreadsheet**
3. Name it "ImportFlow Packages" (or whatever you want)
4. **Keep this tab open** - you'll need it!

### Step 2: Deploy the Apps Script

1. In your Google Sheet, click **Extensions** → **Apps Script**
2. **Delete** all the default code
3. **Copy the entire contents** of `GoogleAppsScript.js` from this project
4. **Paste** it into the Apps Script editor
5. **Save** the project (Ctrl+S or Cmd+S)
6. Click the **Deploy** button → **New deployment**
7. Click the **gear icon** ⚙️ next to "Select type"
8. Choose **Web app**
9. Configure:
   - **Description**: "ImportFlow Webhook"
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
10. Click **Deploy**
11. **Copy the Web App URL** (looks like: `https://script.google.com/macros/s/XXXXX/exec`)

### Step 3: Add the URL to ImportFlow

1. Open your `.env.local` file in the ImportFlow project
2. Add this line (replace with your actual URL):
   ```
   VITE_GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_ACTUAL_URL/exec
   ```
3. **Save the file**
4. **Restart** your development server:
   ```bash
   # Stop the current server (Ctrl+C)
   npm run dev
   ```

### Step 4: Test It!

1. Go to ImportFlow at http://localhost:5173
2. Scan a package or add one manually
3. **Save it**
4. **Go back to your Google Sheet** - the package should appear automatically!

---

## 📋 Google Sheets Columns

Your sheet will have these columns (automatically created):

| Column | Description |
|--------|-------------|
| **Package ID** | Unique package identifier |
| **Tracking Number** | Shipping tracking number |
| **Status** | Current status (received, in customs, delivered, etc.) |
| **Received Date** | When package arrived |
| **Customs Cleared Date** | When cleared by customs |
| **Delivered Date** | When delivered to customer |
| **Customer ID** | Unique customer identifier |
| **Customer Name** | Full customer name |
| **Customer Phone** | Phone number (for SMS) |
| **Customer Email** | Email address |
| **Origin** | Country of origin |
| **Carrier** | Shipping carrier (DHL, FedEx, etc.) |
| **Total Weight (kg)** | Package weight |
| **Items Count** | Number of items in package |
| **Items List** | Human-readable item list |
| **Items Details (JSON)** | Full item data (for Make.com parsing) |
| **Total Value (USD)** | Declared package value |
| **Customs Duty (USD)** | Import duty amount |
| **VAT (USD)** | 13% VAT amount |
| **Total Fees (USD)** | Total customs fees |
| **Payment Status** | Paid or pending |
| **Declared Value (USD)** | Customs declaration value |
| **Currency** | Usually USD |
| **Declaration Purpose** | Personal, commercial, gift, etc. |
| **Certificate of Origin** | Yes/No |
| **Special Permits Required** | Yes/No |
| **Notes** | Additional notes |
| **Created At** | When package was added |
| **Updated At** | Last modification |

---

## 🔄 How It Works

### When You Save a Package:
1. Package is saved to Firebase ✅
2. SMS notification sent to customer ✅
3. **Data automatically syncs to Google Sheets** ✅
4. Google Sheet row appears instantly!

### When You Update a Package:
1. Status changed in ImportFlow ✅
2. Package updated in Firebase ✅
3. SMS sent (if applicable) ✅
4. **Google Sheet row automatically updates** ✅

---

## 🤖 Connect to Make.com

Once your Google Sheet is receiving data:

1. Go to [Make.com](https://www.make.com)
2. Create a new scenario
3. Add **Google Sheets** → **Watch New Rows** trigger
4. Select your "ImportFlow Packages" spreadsheet
5. Add your automation steps (send emails, update CRM, etc.)
6. **Turn on the scenario**

Now every new package automatically triggers your Make.com workflow!

### Example Make.com Workflows:

- **Send WhatsApp notifications** to customers
- **Update your CRM** (Salesforce, HubSpot, etc.)
- **Generate invoices** automatically
- **Send to accounting software** (QuickBooks, Xero)
- **Notify on Slack** when packages arrive
- **Create shipping labels** automatically

---

## 🛠️ Troubleshooting

### Package not appearing in Google Sheets?

1. **Check the browser console** (F12) for errors
2. **Verify the webhook URL** in `.env.local` is correct
3. **Make sure you restarted** the dev server after adding the URL
4. **Check Apps Script permissions** - make sure you authorized it

### Need to re-deploy the script?

1. Go to Apps Script
2. Click **Deploy** → **Manage deployments**
3. Click the **pencil icon** to edit
4. Change version to **New version**
5. Click **Deploy**

### Want to test the Apps Script directly?

1. In Apps Script editor, select the `test()` function from the dropdown
2. Click **Run**
3. Check your Google Sheet - you should see a test row!

---

## 📝 Notes

- The sheet updates **in real-time** (within 1-2 seconds)
- **Duplicate tracking numbers** update the existing row instead of creating new ones
- The **Items Details (JSON)** column contains full structured data for advanced parsing
- All dates are in **ISO 8601 format** for easy parsing by Make.com

---

## 🎉 You're All Set!

Your ImportFlow data is now syncing live to Google Sheets!

**Questions?** Check the main README or create an issue on GitHub.
