# WhatsApp Commands - ImportFlow

This document explains how to use WhatsApp commands to export and manage batches directly from WhatsApp.

> **💡 Don't have WhatsApp Business?** No problem! Check out [SMS_SETUP.md](./SMS_SETUP.md) for a universal SMS solution that works with **ANY phone number** - personal WhatsApp, business WhatsApp, or regular phone. Same commands, same features, no WhatsApp Business account required!

## Overview

ImportFlow supports WhatsApp commands that allow users to:
- Export batch documents for customs
- Receive documents via WhatsApp, SMS, or Email
- Check batch status
- Get help with commands

All AI-extracted data is automatically exported to Google Sheets along with the customs document.

**Alternative methods:**
- **SMS Commands** - Works with any phone number (see [SMS_SETUP.md](./SMS_SETUP.md))
- **WhatsApp Commands** - Requires WhatsApp Business API (this document)
- **Web Dashboard** - Manual export from ImportFlow interface

---

## Available Commands

### 📄 Export Batch (WhatsApp Delivery)

Export a batch and receive the document via WhatsApp.

**Command:**
```
/export batch-1
```

**Response:**
The system will:
1. Generate a Google Doc with customs information
2. Export all AI-extracted data to a Google Sheet
3. Send both links back to your WhatsApp number

---

### 📧 Export Batch (Email Delivery)

Export a batch and receive the document via email.

**Command:**
```
/export batch-1 email:yourname@example.com
```

**Response:**
The system will:
1. Generate a Google Doc with customs information
2. Export all AI-extracted data to a Google Sheet
3. Send both links to the specified email address

---

### 📊 Check Batch Status

Get the current status of a batch.

**Command:**
```
/status batch-1
```

**Response:**
```
✅ Batch Status: Batch 1

Status: ready
Screenshots: 5
Created: 11/30/2025
Weight: 10 kg

✅ Ready to export! Use /export batch-1
```

---

### ❓ Help

Show all available commands.

**Command:**
```
/help
```

or simply:
```
help
```

---

## What Gets Exported

### Google Doc (Customs Document)
The customs document includes:
- Batch information (ID, name, weight, date)
- Screenshot count and sources
- **📸 Original screenshot images embedded in the document**
- All tracking numbers
- Complete order details:
  - Order number
  - Seller/store
  - Item names and quantities
  - Unit prices and totals
  - HS codes (if available)

**Each order section contains:**
1. The actual screenshot image (for customs verification)
2. AI-extracted data below the image
3. Formatted item table
4. Order totals

### Google Sheets (AI-Extracted Data)
The spreadsheet includes all AI-extracted information:
- **Batch Info Sheet:**
  - Batch ID, name, status
  - Total weight and unit
  - Screenshot count
  - Creation and export dates

- **Orders Sheet:**
  - Order number
  - Screenshot ID and source (WhatsApp/Manual)
  - Upload timestamp
  - Extraction status
  - Tracking number
  - Order number
  - Seller/merchant
  - Order date
  - Order total

- **Items Sheet:**
  - Item name
  - Quantity
  - Unit value
  - Total value
  - HS Code
  - Weight
  - Category

---

## Setup Instructions

### 1. Configure Environment Variables

Add these to your `.env.local` file:

```bash
# Google Sheets Webhook (for data export)
VITE_GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

# Google Docs Function (for document generation)
VITE_GOOGLE_DOCS_FUNCTION_URL=https://YOUR_CLOUD_FUNCTION_URL

# Delivery Webhook (for WhatsApp/SMS/Email delivery)
VITE_DELIVERY_WEBHOOK_URL=https://YOUR_DELIVERY_WEBHOOK_URL
```

### 2. Set Up Google Apps Script (Sheets Export)

Create a Google Apps Script to handle sheet exports:

```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  if (data.action === 'exportBatchToSheets') {
    return exportBatchToSheets(data.data);
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: 'Unknown action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function exportBatchToSheets(data) {
  // Create new spreadsheet
  const ss = SpreadsheetApp.create('ImportFlow Batch - ' + data.batchInfo.name);

  // Create Batch Info sheet
  const batchSheet = ss.getActiveSheet();
  batchSheet.setName('Batch Info');
  batchSheet.appendRow(['Field', 'Value']);
  batchSheet.appendRow(['Batch ID', data.batchInfo.id]);
  batchSheet.appendRow(['Batch Name', data.batchInfo.name]);
  batchSheet.appendRow(['Status', data.batchInfo.status]);
  batchSheet.appendRow(['Weight', data.batchInfo.weight + ' ' + data.batchInfo.weightUnit]);
  batchSheet.appendRow(['Screenshot Count', data.batchInfo.screenshotCount]);
  batchSheet.appendRow(['Created At', data.batchInfo.createdAt]);

  // Create Orders sheet
  const ordersSheet = ss.insertSheet('Orders');
  ordersSheet.appendRow([
    'Order #', 'Screenshot ID', 'Source', 'Uploaded At', 'Status',
    'Tracking Number', 'Order Number', 'Seller', 'Order Date', 'Total'
  ]);

  data.orders.forEach(order => {
    ordersSheet.appendRow([
      order.orderNumber,
      order.screenshotId,
      order.source,
      order.uploadedAt,
      order.extractionStatus,
      order.trackingNumber,
      order.orderNumber,
      order.seller,
      order.orderDate,
      order.orderTotal
    ]);
  });

  // Create Items sheet
  const itemsSheet = ss.insertSheet('Items');
  itemsSheet.appendRow([
    'Order #', 'Item Name', 'Quantity', 'Unit Value', 'Total Value',
    'HS Code', 'Weight', 'Category'
  ]);

  data.orders.forEach(order => {
    order.items.forEach(item => {
      itemsSheet.appendRow([
        order.orderNumber,
        item.name,
        item.quantity,
        item.unitValue,
        item.totalValue,
        item.hsCode,
        item.weight,
        item.category
      ]);
    });
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    sheetUrl: ss.getUrl()
  })).setMimeType(ContentService.MimeType.JSON);
}
```

### 3. Set Up Google Apps Script (Document Export with Images)

Create a Google Apps Script to generate documents with embedded screenshots:

```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  if (data.action === 'exportBatchDocument') {
    return exportBatchDocument(data.data);
  }

  return ContentService.createTextOutput(JSON.stringify({
    error: 'Unknown action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function exportBatchDocument(data) {
  // Create new Google Doc
  const doc = DocumentApp.create('ImportFlow Batch - ' + data.batchName);
  const body = doc.getBody();

  // Add title
  body.appendParagraph('CUSTOMS DECLARATION').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Batch: ' + data.batchName).setBold(true);
  body.appendParagraph('Export Date: ' + new Date(data.exportDate).toLocaleDateString());
  body.appendParagraph(''); // Spacing

  // Add batch summary
  body.appendParagraph('BATCH SUMMARY').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Total Orders: ' + data.screenshots.length);
  body.appendParagraph(''); // Spacing

  // Add each screenshot with extracted data
  data.screenshots.forEach((screenshot, index) => {
    // Order header
    body.appendParagraph('ORDER #' + (index + 1)).setHeading(DocumentApp.ParagraphHeading.HEADING3);

    // Add the actual screenshot image
    if (screenshot.imageBase64 && screenshot.imageType) {
      try {
        // Convert base64 to blob
        const imageBlob = Utilities.newBlob(
          Utilities.base64Decode(screenshot.imageBase64),
          screenshot.imageType,
          'screenshot-' + (index + 1)
        );

        // Insert image into document (max width 500px)
        const image = body.appendImage(imageBlob);
        image.setWidth(500);

        body.appendParagraph('Original Screenshot ↑').setItalic(true);
        body.appendParagraph(''); // Spacing
      } catch (error) {
        body.appendParagraph('⚠️ Could not embed screenshot image').setItalic(true);
        Logger.log('Error embedding image: ' + error);
      }
    }

    // Add extracted data
    const extractedData = screenshot.extractedData || {};

    if (extractedData.trackingNumber) {
      body.appendParagraph('Tracking Number: ' + extractedData.trackingNumber);
    }
    if (extractedData.orderNumber) {
      body.appendParagraph('Order Number: ' + extractedData.orderNumber);
    }
    if (extractedData.seller) {
      body.appendParagraph('Seller: ' + extractedData.seller);
    }
    if (extractedData.orderDate) {
      body.appendParagraph('Order Date: ' + extractedData.orderDate);
    }

    // Add items table
    if (extractedData.items && extractedData.items.length > 0) {
      body.appendParagraph(''); // Spacing
      body.appendParagraph('ITEMS:').setBold(true);

      const table = body.appendTable();
      // Header row
      table.appendTableRow().appendTableCell('Item Name').getParent()
        .appendTableCell('Quantity')
        .appendTableCell('Unit Price')
        .appendTableCell('Total');

      // Data rows
      extractedData.items.forEach(item => {
        table.appendTableRow()
          .appendTableCell(item.name).getParent()
          .appendTableCell(String(item.quantity)).getParent()
          .appendTableCell('$' + item.unitValue.toFixed(2)).getParent()
          .appendTableCell('$' + item.totalValue.toFixed(2));
      });

      body.appendParagraph('Order Total: $' + (extractedData.orderTotal || 0).toFixed(2)).setBold(true);
    }

    body.appendParagraph(''); // Spacing
    body.appendHorizontalRule();
    body.appendParagraph(''); // Spacing
  });

  // Return document URL
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    documentUrl: doc.getUrl()
  })).setMimeType(ContentService.MimeType.JSON);
}
```

**Important Notes:**
- Images are embedded at 500px width (adjust as needed)
- Base64 images are decoded and inserted as blobs
- Each screenshot appears above its extracted data for verification
- If image embedding fails, a warning is shown

### 4. Set Up Delivery Webhook (WhatsApp/SMS/Email)

Create a webhook service that handles delivery. Example using Twilio for WhatsApp:

```javascript
// Example Node.js/Express webhook
app.post('/deliver', async (req, res) => {
  const { action, method, recipient, message, documentUrl, sheetUrl } = req.body;

  if (action === 'deliverBatchExport') {
    if (method === 'whatsapp') {
      await twilioClient.messages.create({
        from: 'whatsapp:+14155238886', // Twilio WhatsApp number
        to: `whatsapp:${recipient}`,
        body: message
      });
    } else if (method === 'sms') {
      await twilioClient.messages.create({
        from: YOUR_TWILIO_NUMBER,
        to: recipient,
        body: message
      });
    } else if (method === 'email') {
      await sendEmail({
        to: recipient,
        subject: 'Your ImportFlow Batch Export',
        body: message,
        attachments: [
          { url: documentUrl, filename: 'batch-document.pdf' }
        ]
      });
    }

    res.json({ success: true });
  }
});
```

---

## Usage Flow

### Example: Export via WhatsApp

1. **User sends command:**
   ```
   /export batch-1
   ```

2. **System processes:**
   - Finds batch-1 in database
   - Loads all screenshots for the batch
   - Generates Google Doc with customs info
   - Exports all data to Google Sheets
   - Sends links back to user's WhatsApp

3. **User receives:**
   ```
   ✅ Batch Export Ready

   📦 Batch: Batch 1

   📄 Document: https://docs.google.com/document/d/...
   📊 Spreadsheet: https://docs.google.com/spreadsheets/d/...

   Your customs document is ready for download.
   ```

### Example: Export via Email

1. **User sends command:**
   ```
   /export batch-1 email:customs@mycompany.com
   ```

2. **System processes:**
   - Same as above
   - Sends to specified email instead of WhatsApp

3. **User receives email:**
   ```
   Subject: Your ImportFlow Batch Export

   Your batch "Batch 1" has been exported and is ready for download.

   📄 Customs Document: https://docs.google.com/document/d/...
   📊 Data Spreadsheet: https://docs.google.com/spreadsheets/d/...

   This document contains all the information needed for customs processing.
   ```

---

## AI Extraction Data Included

All data extracted by the Google Gemini AI is included in the Google Sheets export:

✅ **Order Information:**
- Tracking numbers
- Order numbers
- Sellers/merchants
- Order dates

✅ **Item Details:**
- Product names
- Quantities
- Unit prices
- Total values
- HS Codes (when available)
- Item weights
- Product categories

✅ **Batch Metadata:**
- Batch ID and name
- Total weight
- Screenshot sources
- Upload timestamps
- Extraction status

---

## Error Handling

If a command fails, the system will respond with:

**Batch not found:**
```
❌ Batch not found
```

**Unknown command:**
```
❓ Unknown command. Type /help to see available commands.
```

**Export error:**
```
❌ Failed to export batch. Please try again or contact support.
```

---

## Best Practices

1. **Verify batch ID:** Use `/status batch-id` to confirm the batch exists before exporting
2. **Check batch status:** Only export batches with status "ready"
3. **Email for important exports:** Use email delivery for official customs submissions
4. **Keep WhatsApp for quick checks:** Use WhatsApp for quick status checks and previews

---

## Support

For questions or issues with WhatsApp commands:
- Type `/help` in WhatsApp to see available commands
- Contact ImportFlow support
- Check the main documentation in `README.md`

---

## Security Notes

- Commands are authenticated by phone number
- Only authorized numbers can execute commands
- Exported documents are private Google Docs/Sheets
- Links expire after 30 days (configurable)

---

**Last Updated:** November 30, 2025
