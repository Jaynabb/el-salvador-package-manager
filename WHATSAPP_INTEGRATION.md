# WhatsApp Integration Setup Guide

This guide will help you set up WhatsApp integration to automatically receive package photos, extract data with AI, and export to Google Docs.

## Overview

**Flow:**
1. Customer sends package photo via WhatsApp →
2. Make.com receives message →
3. Firebase Cloud Function processes image with Gemini AI →
4. Package saved to Firestore →
5. Google Doc created automatically →
6. Google Sheets updated (existing integration)

---

## Prerequisites

Before starting, ensure you have:

- ✅ Firebase project set up (already configured)
- ✅ Google Cloud Project with billing enabled
- ✅ Make.com account (free tier is sufficient to start)
- ✅ WhatsApp Business account or WhatsApp Business API access
- ✅ Gemini API key (already configured)

---

## Part 1: Firebase Cloud Functions Setup

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### Step 2: Initialize Firebase Functions (if not done)

```bash
cd el-salvador-package-manager
firebase init functions
```

Select:
- Language: **TypeScript**
- ESLint: **Yes**
- Install dependencies: **Yes**

### Step 3: Install Function Dependencies

```bash
cd functions
npm install
```

### Step 4: Set Environment Variables

```bash
# Set Gemini API key
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"

# Verify configuration
firebase functions:config:get
```

### Step 5: Enable Google Docs API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Navigate to **APIs & Services** → **Library**
4. Search for "**Google Docs API**" and enable it
5. Search for "**Google Drive API**" and enable it

### Step 6: Set up Service Account (for Google Docs)

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
   - Name: `package-manager-docs`
   - Role: **Editor**
3. Click **Create Key** → **JSON**
4. Download the key file
5. Set it in Firebase:

```bash
firebase functions:config:set google.credentials="$(cat path/to/service-account-key.json)"
```

### Step 7: Deploy Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

After deployment, note the function URLs:
- `processWhatsAppImage` - for receiving WhatsApp images
- `createPackageDoc` - for creating Google Docs from frontend

Example URLs:
```
https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/processWhatsAppImage
https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/createPackageDoc
```

---

## Part 2: Make.com WhatsApp Automation

### Step 1: Create Make.com Account

1. Sign up at [Make.com](https://www.make.com/)
2. Start with the **free plan** (1,000 operations/month)

### Step 2: Set up WhatsApp Integration

**Option A: Using WhatsApp Cloud API (Recommended)**

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app → **Business** type
3. Add **WhatsApp** product
4. Get your:
   - Phone Number ID
   - WhatsApp Business Account ID
   - Access Token
5. Set up webhook URL (Make.com will provide this)

**Option B: Using Twilio WhatsApp (Easier)**

1. Sign up at [Twilio](https://www.twilio.com/)
2. Get a WhatsApp-enabled phone number
3. Note your Account SID and Auth Token

### Step 3: Create Make.com Scenario

1. In Make.com, click **Create a new scenario**
2. Add modules in this order:

#### Module 1: WhatsApp Trigger
- Choose **WhatsApp** → **Watch Messages**
- Connect your WhatsApp account (Meta or Twilio)
- Filter: **Message Type** = `image`

#### Module 2: Download Image
- Add **HTTP** → **Get a file**
- URL: `{{message.media.url}}`
- This downloads the image from WhatsApp

#### Module 3: Convert Image to Base64
- Add **Tools** → **Set variable**
- Variable name: `imageBase64`
- Value: `{{base64(2.data)}}`

#### Module 4: Call Firebase Cloud Function
- Add **HTTP** → **Make a request**
- URL: `https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/processWhatsAppImage`
- Method: `POST`
- Headers:
  ```
  Content-Type: application/json
  ```
- Body:
  ```json
  {
    "customerPhone": "{{message.from}}",
    "customerName": "{{message.name}}",
    "imageBase64": "{{imageBase64}}",
    "imageType": "{{message.media.contentType}}"
  }
  ```

#### Module 5: Send WhatsApp Reply (Optional)
- Add **WhatsApp** → **Send a Message**
- To: `{{message.from}}`
- Message:
  ```
  ✅ Package received!
  Tracking: {{response.trackingNumber}}
  Total Value: ${{response.extractedData.totalValue}}
  Fees: ${{response.extractedData.totalFees}}

  View details: {{response.googleDocUrl}}
  ```

### Step 4: Test the Scenario

1. Click **Run once** in Make.com
2. Send a test image to your WhatsApp number
3. Check the execution log in Make.com
4. Verify:
   - Package created in Firestore
   - Google Doc created
   - Google Sheets updated

### Step 5: Activate Automation

1. Click **Scheduling** → **On**
2. Set interval: **Immediately as data arrives**
3. Save scenario

---

## Part 3: Frontend Configuration

### Step 1: Add Environment Variable

Add to your `.env.local` file:

```env
VITE_GOOGLE_DOCS_FUNCTION_URL=https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net
```

### Step 2: Test Frontend Google Docs Export

The Google Docs export will now work automatically when:
1. Saving packages through the UI
2. Batch scanning packages
3. Receiving packages via WhatsApp

---

## Part 4: Testing End-to-End

### Test Checklist

1. **Send test WhatsApp message**
   - Send a package photo to your WhatsApp Business number
   - Verify Make.com receives it (check execution log)

2. **Verify Cloud Function execution**
   - Check Firebase Functions logs:
     ```bash
     firebase functions:log
     ```
   - Look for "Processing WhatsApp image for customer:"

3. **Check Firestore**
   - Open Firebase Console → Firestore
   - Verify new package document created
   - Check `documentUrls` field contains Google Doc link

4. **Verify Google Doc created**
   - Open the Google Doc URL from Firestore
   - Confirm it has:
     - Customer info
     - Package details
     - Items list
     - Financial information
     - Customs declaration

5. **Check Google Sheets**
   - Open your Google Sheet
   - Verify new row added with package data

---

## Troubleshooting

### Issue: "Failed to create Google Doc"

**Solutions:**
- Verify Google Docs API is enabled
- Check service account has Editor role
- Ensure service account credentials are set correctly:
  ```bash
  firebase functions:config:get google.credentials
  ```

### Issue: "Gemini API error"

**Solutions:**
- Verify Gemini API key is set:
  ```bash
  firebase functions:config:get gemini.api_key
  ```
- Check API key is valid at [Google AI Studio](https://aistudio.google.com/)
- Ensure billing is enabled for Google Cloud project

### Issue: Make.com not receiving WhatsApp messages

**Solutions:**
- Verify WhatsApp webhook is configured correctly
- Check WhatsApp Business API subscription is active
- Test webhook URL directly using Postman

### Issue: Cloud Function timeout

**Solutions:**
- Increase timeout in `functions/src/index.ts`:
  ```typescript
  export const processWhatsAppImage = onRequest({
    timeoutSeconds: 540, // Max timeout
    memory: "1GiB",
  }, ...
  ```
- Optimize image size before sending to Gemini

---

## Cost Estimates

### Make.com
- **Free plan:** 1,000 operations/month
- **Core plan:** $9/month for 10,000 operations
- Each WhatsApp message = 5 operations (receive, download, convert, call function, reply)
- **Estimate:** ~200 packages/month on free plan

### Firebase Cloud Functions
- **Free tier:** 2M invocations/month, 400K GB-seconds
- **Paid tier:** $0.40 per million invocations
- **Estimate:** ~$0-5/month for moderate usage

### Google Gemini API
- **Free tier:** 60 requests/minute
- **Paid tier:** $0.00025 per image
- **Estimate:** Free for up to 1,800 images/month

### WhatsApp Business API (Meta)
- **Free tier:** 1,000 conversations/month
- **Paid tier:** Varies by country (~$0.005-0.05 per message)
- **Estimate:** Free for small businesses

**Total estimated cost:** $0-15/month for small businesses

---

## Security Considerations

### 1. Webhook Security
Add verification token to Cloud Function:

```typescript
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

### 2. Google Docs Permissions
- Default: Anyone with link can view
- To restrict: Update permissions in `googleDocsService.ts`:
  ```typescript
  await drive.permissions.create({
    fileId: documentId,
    requestBody: {
      role: 'reader',
      type: 'user',
      emailAddress: packageData.customerEmail, // Only customer can view
    },
  });
  ```

### 3. Rate Limiting
Add rate limiting to prevent abuse:

```bash
npm install express-rate-limit
```

### 4. Customer Data Privacy
- Ensure GDPR/CCPA compliance
- Add data retention policies
- Implement customer data deletion endpoints

---

## Advanced Features (Optional)

### 1. WhatsApp Status Updates

Send automatic updates when package status changes:

```typescript
// In Cloud Function
async function sendWhatsAppUpdate(phone: string, message: string) {
  await fetch('MAKE_COM_WEBHOOK_URL', {
    method: 'POST',
    body: JSON.stringify({ phone, message }),
  });
}
```

### 2. Multi-language Support

Add language detection and translation:

```typescript
import { Translate } from '@google-cloud/translate';
const translate = new Translate();

const [translation] = await translate.translate(message, 'es');
```

### 3. Voice Messages

Extract data from voice messages using Speech-to-Text:

```typescript
import { SpeechClient } from '@google-cloud/speech';
```

### 4. Batch Processing

Process multiple images in one WhatsApp message:

```typescript
for (const media of message.media) {
  await processImage(media);
}
```

---

## Support

For issues or questions:
- Check Firebase Functions logs: `firebase functions:log`
- Review Make.com execution history
- Test individual components separately
- Contact support: [your-support-email@domain.com]

---

## Next Steps

1. ✅ Deploy Cloud Functions
2. ✅ Set up Make.com automation
3. ✅ Test with sample WhatsApp message
4. ✅ Monitor logs and usage
5. ✅ Optimize based on performance
6. ✅ Add additional features as needed

---

**Last updated:** November 2025
**Version:** 1.0.0
