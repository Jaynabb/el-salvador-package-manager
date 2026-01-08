# Complete Workflow Guide - WhatsApp Order Processing System

## 🎯 System Overview

This system allows **importers** to receive order screenshots from customers via WhatsApp, automatically extract product data using AI, and generate professional Google Docs with all order details.

### Key Features:
- ✅ Receive multiple screenshots per customer via WhatsApp
- ✅ Automatic AI extraction of items, prices, tracking numbers
- ✅ Batch processing - combine all screenshots into ONE document
- ✅ Custom package numbering (PKG-2025-11-001)
- ✅ Automatic customs duty calculation for El Salvador
- ✅ Google Docs export + Google Sheets sync

---

## 📱 The Complete Workflow

### **STEP 1: Customer Sends Order Screenshots to Importer**

**Scenario:**
- Customer Maria places 3 orders on Amazon
- She screenshots each order confirmation
- She sends all 3 screenshots to the importer via regular WhatsApp

**What customer sends:**
```
Maria's WhatsApp → Importer's WhatsApp
├─ Screenshot 1: iPhone 15 Pro order
├─ Screenshot 2: AirPods Pro order
└─ Screenshot 3: MacBook charger order
```

---

### **STEP 2: Importer Forwards to System via WhatsApp**

**The importer now sends everything to the system's business WhatsApp:**

```
Importer sends to System WhatsApp:
├─ Text message: "Maria Rodriguez" (customer name)
├─ Forward Screenshot 1
├─ Forward Screenshot 2
└─ Forward Screenshot 3
```

**IMPORTANT:** The importer includes the customer name as a text message!

---

### **STEP 3: Make.com Receives Messages**

**Make.com automation triggers for each message:**

Message 1 (Text):
```json
{
  "from": "+503 1234-5678",  // Importer's phone
  "type": "text",
  "body": "Maria Rodriguez"
}
```

Message 2 (Image):
```json
{
  "from": "+503 1234-5678",
  "type": "image",
  "media": {
    "url": "https://whatsapp.com/img1.jpg"
  }
}
```

Messages 3 & 4 (More images) - same format

---

### **STEP 4: Make.com Calls Cloud Function for Each Message**

**Make.com Scenario Setup:**

**Module 1: Watch WhatsApp Messages**
- Triggers on new messages (text OR image)

**Module 2 (if text): Send to Cloud Function**
```
POST https://your-project.cloudfunctions.net/receiveWhatsAppMessage
{
  "senderPhone": "{{message.from}}",
  "messageType": "text",
  "textContent": "{{message.body}}"
}
```

**Module 3 (if image): Download Image**
- URL: `{{message.media.url}}`

**Module 4: Convert to Base64**
- `{{base64(image.data)}}`

**Module 5: Send to Cloud Function**
```
POST https://your-project.cloudfunctions.net/receiveWhatsAppMessage
{
  "senderPhone": "{{message.from}}",
  "messageType": "image",
  "imageBase64": "{{base64}}",
  "imageType": "image/jpeg"
}
```

---

### **STEP 5: Cloud Function Stores Messages**

**What happens in `receiveWhatsAppMessage` function:**

```typescript
// 1. Find or create "conversation" for this sender
//    Groups messages from same phone within 10-minute window

// 2. Store message in Firestore
await db.collection("incomingMessages").add({
  senderPhone: "+503 1234-5678",
  messageType: "text" or "image",
  textContent: "Maria Rodriguez" (if text),
  imageBase64: "..." (if image),
  conversationId: "conv-abc123",  // Links to conversation
  status: "pending",
  receivedAt: new Date()
});

// 3. Update conversation
await db.collection("conversations").doc("conv-abc123").update({
  messageIds: [...existing, newMessageId],
  imageCount: 3,
  textCount: 1,
  extractedCustomerName: "Maria Rodriguez",  // Extracted from text!
  status: "ready"  // Has both name AND images
});
```

**Firestore after all 4 messages:**

```
/conversations/conv-abc123
  ├─ senderPhone: "+503 1234-5678"
  ├─ extractedCustomerName: "Maria Rodriguez"
  ├─ messageIds: ["msg-1", "msg-2", "msg-3", "msg-4"]
  ├─ imageCount: 3
  ├─ textCount: 1
  ├─ status: "ready"
  └─ lastMessageAt: 2025-11-29 10:35:00

/incomingMessages
  ├─ msg-1: {type: "text", textContent: "Maria Rodriguez", ...}
  ├─ msg-2: {type: "image", imageBase64: "...", ...}
  ├─ msg-3: {type: "image", imageBase64: "...", ...}
  └─ msg-4: {type: "image", imageBase64: "...", ...}
```

---

### **STEP 6: Importer Opens Web App**

**Importer navigates to `/incoming-orders` page**

**UI shows:**

```
╔══════════════════════════════════════════════════════════╗
║  📱 INCOMING ORDERS                                       ║
╠══════════════════════════════════════════════════════════╣
║                                                           ║
║  ✅ +503 1234-5678                          READY         ║
║  ─────────────────────────────────────────────────────    ║
║  📷 3 screenshots  💬 1 text message                     ║
║  Received: 2 minutes ago                                  ║
║                                                           ║
║  Customer Name: [Maria Rodriguez_____________]            ║
║                                                           ║
║  [✅ Process All Screenshots]                             ║
║                                                           ║
╠══════════════════════════════════════════════════════════╣
║  (Click to expand and see screenshot previews)            ║
╚══════════════════════════════════════════════════════════╝
```

**Note:** Customer name already filled in (extracted from text message)!

---

### **STEP 7: Importer Clicks "Process All Screenshots"**

**Frontend calls Cloud Function:**

```javascript
await fetch(`${CLOUD_FUNCTION_URL}/processBatchScreenshots`, {
  method: 'POST',
  body: JSON.stringify({
    conversationId: "conv-abc123",
    customerName: "Maria Rodriguez"  // Already extracted!
  })
});
```

---

### **STEP 8: Cloud Function Processes Batch**

**What happens in `processBatchScreenshots` function:**

```typescript
// 1. Get all image messages from conversation
const images = await db.collection("incomingMessages")
  .where("conversationId", "==", "conv-abc123")
  .where("messageType", "==", "image")
  .get();

// 2. Process EACH screenshot with Gemini AI
for (const image of images) {
  const extracted = await analyzeOrderScreenshot(image.imageBase64);
  // Returns: {trackingNumber, items[], orderTotal, ...}
}

// Results:
// Screenshot 1 → {tracking: "1Z999AA1", items: [{iPhone 15 Pro, $999}]}
// Screenshot 2 → {tracking: "1Z999AA2", items: [{AirPods Pro, $249}]}
// Screenshot 3 → {tracking: "92612901", items: [{MacBook Charger, $79}]}

// 3. Combine ALL data
const allTrackingNumbers = ["1Z999AA1", "1Z999AA2", "92612901"];
const allItems = [
  {name: "iPhone 15 Pro", quantity: 1, unitValue: 999, totalValue: 999},
  {name: "AirPods Pro", quantity: 1, unitValue: 249, totalValue: 249},
  {name: "MacBook Charger", quantity: 1, unitValue: 79, totalValue: 79}
];
const totalValue = 999 + 249 + 79 = 1327;

// 4. Calculate customs duties (El Salvador)
const {duty, vat, totalFees} = calculateDuty(1327, allItems);
// duty: $66.35 (5% for electronics)
// vat: $181.04 (13% of value + duty)
// totalFees: $247.39

// 5. Generate package number
const packageNumber = await generatePackageNumber();
// Returns: "PKG-2025-11-001"

// 6. Find or create customer
const customer = await findOrCreateCustomer(
  "+503 1234-5678",  // Importer's phone (but we use for customer)
  "Maria Rodriguez",
  importerId
);

// 7. Create package in Firestore
const packageData = {
  packageNumber: "PKG-2025-11-001",
  trackingNumbers: ["1Z999AA1", "1Z999AA2", "92612901"],
  customerName: "Maria Rodriguez",
  customerPhone: "+503 1234-5678",
  items: allItems,  // All 3 items
  totalValue: 1327,
  customsDuty: 66.35,
  vat: 181.04,
  totalFees: 247.39,
  screenshotCount: 3,
  status: "pending-arrival",
  orderDate: new Date(),
  ...
};

await db.collection("packages").add(packageData);

// 8. Create Google Doc
const docUrl = await createBatchDocument(packageData);
// Creates formatted document with all data

// 9. Mark messages as processed
// All 3 image messages marked as processed
// Conversation marked as processed
```

---

### **STEP 9: Google Doc Created**

**Document Title:** `PKG-2025-11-001 - Maria Rodriguez`

**Document Content:**

```
📦 PACKAGE IMPORT ORDER

PACKAGE NUMBER
PKG-2025-11-001

CUSTOMER INFORMATION
Name: Maria Rodriguez
Phone: +503 1234-5678

ORDER DETAILS
Order Date: November 29, 2025
Status: PENDING-ARRIVAL
Total Screenshots Processed: 3

TRACKING NUMBERS
1. 1Z999AA10123456784
2. 1Z999AA20987654321
3. 92612901234567890

ITEMS ORDERED
Total Items: 3

1. Apple iPhone 15 Pro 256GB Blue Titanium
   Quantity: 1
   Unit Price: $999.00 USD
   Total Price: $999.00 USD
   Category: electronics

2. Apple AirPods Pro 2nd Generation
   Quantity: 1
   Unit Price: $249.00 USD
   Total Price: $249.00 USD
   Category: electronics

3. Apple 96W USB-C Power Adapter
   Quantity: 1
   Unit Price: $79.00 USD
   Total Price: $79.00 USD
   Category: electronics

FINANCIAL SUMMARY
Total Order Value: $1,327.00 USD

El Salvador Customs Fees:
  Customs Duty: $66.35 USD
  VAT (13%): $181.04 USD
  Total Fees: $247.39 USD

GRAND TOTAL: $1,574.39 USD
Payment Status: PENDING

CUSTOMS DECLARATION
Declared Value: $1,327.00 USD
Currency: USD
Purpose: personal

IMPORTANT INFORMATION
• Keep this document for your records
• Customs fees must be paid before package release
• Tracking numbers will be active once packages ship
• Contact us for any questions or concerns

─────────────────────────────────────
Document Generated: November 29, 2025 10:40 AM
Package Number: PKG-2025-11-001
ImportFlow Package Manager
```

---

### **STEP 10: Success Response**

**Cloud Function returns:**

```json
{
  "success": true,
  "packageId": "pkg-abc123",
  "packageNumber": "PKG-2025-11-001",
  "trackingNumbers": ["1Z999AA1", "1Z999AA2", "92612901"],
  "items": [
    {"name": "iPhone 15 Pro", "quantity": 1, "totalValue": 999},
    {"name": "AirPods Pro", "quantity": 1, "totalValue": 249},
    {"name": "MacBook Charger", "quantity": 1, "totalValue": 79}
  ],
  "totalValue": 1327,
  "totalFees": 247.39,
  "googleDocUrl": "https://docs.google.com/document/d/abc123/edit"
}
```

**Frontend shows:**

```
✅ SUCCESS!

Package Created: PKG-2025-11-001
Customer: Maria Rodriguez
Items: 3 items
Total Value: $1,327.00
Total Fees: $247.39

📄 Google Doc: [View Document]
📊 Google Sheets: Updated ✓
```

---

### **STEP 11: Google Sheets Sync (Automatic)**

**Your existing Google Sheets webhook is called automatically:**

New row added:

| Package# | Customer | Phone | Items | Value | Duty | VAT | Total Fees | Status | Doc URL |
|----------|----------|-------|-------|-------|------|-----|------------|--------|---------|
| PKG-2025-11-001 | Maria Rodriguez | +503 1234-5678 | iPhone 15 Pro (1), AirPods Pro (1), MacBook Charger (1) | $1,327 | $66.35 | $181.04 | $247.39 | pending-arrival | [Link] |

---

## 🔄 Next Batch - Start New Document

**When ready for next customer:**

1. Importer receives new screenshots from different customer
2. Importer sends: "Juan Perez" + screenshots
3. System creates NEW conversation
4. Process repeats
5. NEW document created: `PKG-2025-11-002 - Juan Perez`

**Each batch = One document = One package number**

---

## 📊 Database Structure Summary

```
Firestore Collections:

/conversations (temporary grouping)
  ├─ conv-abc123
  │   ├─ senderPhone: "+503 1234-5678"
  │   ├─ extractedCustomerName: "Maria Rodriguez"
  │   ├─ messageIds: ["msg-1", "msg-2", "msg-3", "msg-4"]
  │   ├─ imageCount: 3
  │   ├─ textCount: 1
  │   ├─ status: "processed"
  │   └─ packageId: "pkg-abc123"

/incomingMessages (temporary storage)
  ├─ msg-1: {type: "text", textContent: "Maria Rodriguez"}
  ├─ msg-2: {type: "image", imageBase64: "...", processed: true}
  ├─ msg-3: {type: "image", imageBase64: "...", processed: true}
  └─ msg-4: {type: "image", imageBase64: "...", processed: true}

/packages (permanent records)
  └─ pkg-abc123
      ├─ packageNumber: "PKG-2025-11-001"
      ├─ trackingNumbers: ["1Z999AA1", "1Z999AA2", "92612901"]
      ├─ customerName: "Maria Rodriguez"
      ├─ items: [{...}, {...}, {...}]
      ├─ screenshotCount: 3
      ├─ screenshotIds: ["msg-2", "msg-3", "msg-4"]
      ├─ totalValue: 1327
      ├─ documentUrls: ["https://docs.google.com/..."]
      └─ ...

/customers
  └─ cust-123
      ├─ name: "Maria Rodriguez"
      ├─ phone: "+503 1234-5678"
      └─ importerId: "imp-456"
```

---

## 🎯 Key Points

### Customer Name Extraction
- ✅ Importer sends text message with customer name
- ✅ System automatically extracts it
- ✅ Pre-fills in UI
- ✅ Importer can edit if needed

### Conversation Grouping
- ✅ Messages from same sender within 10 minutes = one conversation
- ✅ Prevents mixing different customers
- ✅ Status changes: `active` → `ready` (has name + images) → `processed`

### Package Numbering
- ✅ Sequential: PKG-2025-11-001, PKG-2025-11-002, etc.
- ✅ Resets each month
- ✅ Unique per batch

### One Document Per Batch
- ✅ All screenshots from ONE conversation → ONE document
- ✅ Document contains ALL items from ALL screenshots
- ✅ Next batch gets NEW document

---

## 🚀 Deployment Steps

### 1. Deploy Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

**Functions deployed:**
- `receiveWhatsAppMessage` - Stores incoming messages
- `processBatchScreenshots` - Batch processes and creates docs

### 2. Configure Make.com

Create scenario with 2 paths:

**Path A: Text Message**
```
Watch WhatsApp → Is Text? → Call receiveWhatsAppMessage with text
```

**Path B: Image Message**
```
Watch WhatsApp → Is Image? → Download → Base64 → Call receiveWhatsAppMessage with image
```

### 3. Update Frontend

Add to `.env.local`:
```
VITE_GOOGLE_DOCS_FUNCTION_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net
```

### 4. Add Route

In `App.tsx`:
```tsx
import IncomingOrders from './components/IncomingOrders';

// Add route
<Route path="/incoming-orders" element={<IncomingOrders />} />
```

---

## 📖 Usage Instructions for Importers

### For Importers Using the System:

1. **Receive screenshots from customer** (via your personal WhatsApp)

2. **Forward to system WhatsApp:**
   - First, send customer name as text: "Maria Rodriguez"
   - Then, forward all screenshots

3. **Wait 1-2 minutes** for processing

4. **Open web app** → Go to "Incoming Orders"

5. **Review conversation:**
   - See customer name (already filled)
   - See screenshot count
   - Click to expand and preview

6. **Click "Process All Screenshots"**

7. **Wait ~10-30 seconds** (AI processing all images)

8. **Get result:**
   - Package number
   - Google Doc link
   - Summary of items and fees

9. **Share with customer:**
   - Send them the Google Doc link
   - Or download as PDF and send

10. **Start next batch** - System ready for next customer!

---

## 💡 Tips & Best Practices

### For Best Results:

**Clear Screenshots:**
- Make sure order details are visible
- Include prices, quantities, item names
- Tracking numbers if available

**Customer Name:**
- Send as first message
- Use full name: "Maria Rodriguez" not just "Maria"
- System will remember for future batches

**Timing:**
- Send all screenshots within 10 minutes
- System groups by time window
- If you wait too long, it creates new conversation

**Verification:**
- Always review extracted data in Google Doc
- AI is accurate but can miss details
- Edit document if needed

---

## 🐛 Troubleshooting

### Issue: "No customer name found"

**Solution:**
- Make sure you sent a text message with the name
- It should be just the name, not "Customer: Maria"
- Importer can also type name in UI manually

### Issue: "No images found"

**Solution:**
- Make sure you sent image messages, not file attachments
- WhatsApp images work, but documents don't
- Take screenshot of orders, don't send PDFs

### Issue: "Processing takes too long"

**Solution:**
- Large images slow down processing
- Compress screenshots before sending
- Typical time: 5-10 seconds per screenshot

### Issue: "Wrong items extracted"

**Solution:**
- Screenshot quality may be poor
- Make sure text is readable
- You can manually edit the Google Doc after

---

**System is now ready to use!** 🎉

Send your first batch and watch the automation work!
