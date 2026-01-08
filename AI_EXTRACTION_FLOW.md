# AI Screenshot Extraction Flow

## When Does AI Extract Data from Screenshots?

### Current Implementation

The AI extraction happens **automatically in the background** after a screenshot is uploaded:

## 1. Manual Upload (Batch Manager Page)

**Flow:**
```
User uploads screenshot
    ↓
File is converted to base64
    ↓
Screenshot saved to Firestore (status: 'pending')
    ↓
processScreenshot() function is called IMMEDIATELY
    ↓
Status updated to 'processing'
    ↓
analyzePackagePhoto(base64) calls Gemini AI
    ↓
AI extracts: items, quantities, prices, tracking numbers
    ↓
Screenshot updated with extractedData (status: 'completed')
    ↓
UI refreshes to show extracted data
```

**Code Location:** `src/components/BatchManager.tsx` line 187-215

```typescript
const processScreenshot = async (screenshotId: string, base64: string) => {
  try {
    // Update status to processing
    await updateDoc(doc(db, 'screenshots', screenshotId), {
      extractionStatus: 'processing'
    });

    // Call Gemini AI - THIS IS WHERE AI SCRAPES THE SCREENSHOT
    const extracted = await analyzePackagePhoto(base64);

    // Update with results
    await updateDoc(doc(db, 'screenshots', screenshotId), {
      extractedData: extracted,
      extractionStatus: 'completed',
      processedAt: Timestamp.fromDate(new Date())
    });

    // Reload to show updated data
    if (activeBatch) {
      await loadScreenshots(activeBatch.id);
    }
  } catch (error) {
    console.error('Error extracting data:', error);
    await updateDoc(doc(db, 'screenshots', screenshotId), {
      extractionStatus: 'error',
      extractionError: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
```

**Called from:** Line 164 in `handleFileUpload()`
```typescript
// Extract data with AI in background
processScreenshot(screenshotRef.id, base64);
```

## 2. WhatsApp Upload (When Implemented)

**Flow:**
```
WhatsApp webhook receives image
    ↓
Cloud Function downloads image
    ↓
Converts to base64
    ↓
Saves screenshot to Firestore (status: 'pending')
    ↓
Cloud Function calls Gemini AI immediately
    ↓
Updates screenshot with extracted data
    ↓
User sees extracted data in web app
```

**Code Location:** Will be in Firebase Cloud Functions

```typescript
// functions/src/index.ts (when implemented)
export const whatsappWebhook = onRequest(async (req, res) => {
  // ... handle WhatsApp message ...

  if (NumMedia && parseInt(NumMedia) > 0) {
    // Download image
    const imageBuffer = await downloadImage(MediaUrl0);
    const base64 = imageBuffer.toString('base64');

    // Save screenshot
    const screenshotRef = await db.collection('screenshots').add({
      batchId: activeBatch.id,
      source: 'whatsapp',
      imageBase64: base64,
      extractionStatus: 'pending',
      uploadedAt: new Date()
    });

    // IMMEDIATELY extract data with AI
    const extractedData = await analyzePackagePhoto(base64);

    // Update screenshot with extracted data
    await screenshotRef.update({
      extractedData,
      extractionStatus: 'completed',
      processedAt: new Date()
    });

    // Notify user via WhatsApp
    await sendWhatsAppReply(From,
      `✓ Screenshot processed!\n` +
      `Items: ${extractedData.items.length}\n` +
      `Total: $${extractedData.orderTotal}`
    );
  }
});
```

## 3. AI Service (Gemini)

**Code Location:** `src/services/geminiService.ts`

**What it extracts:**
- Tracking number
- Order number
- Seller/store name
- Order date
- Items array with:
  - Item name
  - Quantity
  - Unit price
  - Total value
  - HS Code (for customs)
- Order total

**Example Response:**
```json
{
  "trackingNumber": "1Z999AA10123456789",
  "orderNumber": "112-1234567-8901234",
  "seller": "Amazon",
  "orderDate": "2024-11-25",
  "items": [
    {
      "name": "iPhone 15 Case",
      "quantity": 5,
      "unitValue": 20.00,
      "totalValue": 100.00,
      "hsCode": "3926.90"
    }
  ],
  "orderTotal": 100.00
}
```

## Summary: When Does AI Scrape?

✅ **Immediately** after screenshot upload (manual or WhatsApp)
✅ **Automatically** in the background
✅ **Before** user sees the batch details
❌ **NOT** when user clicks "Process Batch" (that creates the package)
❌ **NOT** when user clicks "Export" (that just exports existing data)

## Current Status

- ✅ **BatchManager:** AI extraction working on manual uploads
- ⏳ **WhatsApp:** Not yet implemented (needs Cloud Function)
- ✅ **UI:** Shows extraction status (pending/processing/completed/error)
- ✅ **Display:** Extracted data shown in order inquiry cards

## To Enable WhatsApp AI Extraction:

1. Deploy Cloud Function with WhatsApp webhook
2. Configure Twilio to send webhooks to Cloud Function
3. Cloud Function will automatically call Gemini AI on each image
4. User sees extracted data in web app immediately
