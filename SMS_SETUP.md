# SMS Command Setup - ImportFlow

**Works with ANY phone number - personal or business!**

This guide shows you how to set up SMS-based commands for ImportFlow batch exports. Clients can send commands from any phone (WhatsApp personal number, regular phone, business number - doesn't matter).

---

## Why SMS?

✅ **Universal Access**
- Works with ANY phone number (personal or business)
- No WhatsApp Business account required
- No app installation needed
- Works on basic phones, not just smartphones

✅ **Simple Integration**
- Easy Twilio setup (or any SMS provider)
- Same command syntax as WhatsApp
- Automatic delivery back via SMS

---

## Available Commands

All commands work exactly the same as WhatsApp:

```
/export batch-1
/export batch-1 email:user@example.com
/status batch-1
/help
```

**Example conversation:**

```
Client SMS: /export batch-1

ImportFlow Reply:
✅ Batch Export Ready

📦 Batch: Batch 1

📄 Document: https://docs.google.com/document/d/...
📊 Spreadsheet: https://docs.google.com/spreadsheets/d/...

Your customs document is ready for download.
```

---

## Setup with Twilio (Recommended)

### 1. Create Twilio Account

1. Go to [Twilio.com](https://www.twilio.com)
2. Sign up for a free account
3. Get a phone number (can handle SMS)
4. Note your **Account SID** and **Auth Token**

**Cost:** ~$1/month for number + $0.0075 per SMS (very cheap)

### 2. Deploy SMS Webhook

You need a server endpoint to receive SMS webhooks. Here are your options:

#### Option A: Firebase Cloud Function (Easiest)

Create `functions/sms-webhook.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { parseCommand, getHelpMessage, getBatchStatusMessage, getUnknownCommandMessage } = require('./commandService');
const { exportAndDeliverBatch } = require('./batchExportService');

admin.initializeApp();
const db = admin.firestore();

exports.smsWebhook = functions.https.onRequest(async (req, res) => {
  // Twilio sends POST with form data
  const from = req.body.From;  // Phone number
  const body = req.body.Body;  // Message text

  console.log(`📱 SMS from ${from}: ${body}`);

  // Parse command
  const command = parseCommand(body, from, 'sms');

  let reply = '';

  // Handle help
  if (command.type === 'help') {
    reply = getHelpMessage('sms');
  }
  // Handle status
  else if (command.type === 'status' && command.batchId) {
    try {
      const batchDoc = await db.collection('batches').doc(command.batchId).get();

      if (!batchDoc.exists) {
        reply = '❌ Batch not found';
      } else {
        const batch = { id: batchDoc.id, ...batchDoc.data() };
        reply = getBatchStatusMessage(batch);
      }
    } catch (error) {
      console.error('Error:', error);
      reply = '❌ Error retrieving batch status';
    }
  }
  // Handle export
  else if (command.type === 'export' && command.batchId) {
    try {
      const batchDoc = await db.collection('batches').doc(command.batchId).get();

      if (!batchDoc.exists) {
        reply = '❌ Batch not found';
      } else {
        const batch = { id: batchDoc.id, ...batchDoc.data() };

        // Get screenshots
        const screenshotsSnapshot = await db
          .collection('screenshots')
          .where('batchId', '==', command.batchId)
          .get();

        const screenshots = screenshotsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (batch.status !== 'ready') {
          reply = `⚠️ Batch not ready for export.\nCurrent status: ${batch.status}`;
        } else {
          // Export batch
          const result = await exportAndDeliverBatch(
            batch,
            screenshots,
            command.deliveryMethod || 'sms',
            command.email || from
          );

          if (result.success) {
            reply = `✅ Batch Export Ready

📦 Batch: ${batch.customerName || command.batchId}

📄 Document: ${result.documentUrl}
${result.sheetUrl ? `📊 Spreadsheet: ${result.sheetUrl}` : ''}

Your customs document is ready for download.`;
          } else {
            reply = `❌ Export failed: ${result.message}`;
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      reply = '❌ Error exporting batch';
    }
  }
  // Unknown command
  else {
    reply = getUnknownCommandMessage();
  }

  // Send TwiML response
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply}</Message>
</Response>`);
});
```

Deploy:
```bash
firebase deploy --only functions:smsWebhook
```

#### Option B: Vercel Serverless Function

Create `api/sms-webhook.js`:

```javascript
// Same logic as above, but export as:
module.exports = async (req, res) => {
  // ... SMS processing logic
};
```

#### Option C: Express.js Server

```javascript
const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: false }));

app.post('/sms/webhook', async (req, res) => {
  // ... SMS processing logic
});

app.listen(3000);
```

### 3. Configure Twilio Webhook

1. Go to Twilio Console > Phone Numbers
2. Click your phone number
3. Under "Messaging", find "A MESSAGE COMES IN"
4. Set webhook URL to your endpoint:
   - Firebase: `https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/smsWebhook`
   - Vercel: `https://your-app.vercel.app/api/sms-webhook`
   - Express: `https://your-domain.com/sms/webhook`
5. Set HTTP method to **POST**
6. Save

### 4. Test It!

Send an SMS to your Twilio number:

```
/help
```

You should get back:

```
📦 ImportFlow Commands

Available commands:

📄 /export [batch-id]
Export batch document and receive it via SMS
Example: /export batch-1

📧 /export [batch-id] email:[your-email]
Export batch document and receive it via email
Example: /export batch-1 email:user@example.com

📊 /status [batch-id]
Check the status of a batch
Example: /status batch-1

❓ /help
Show this help message

---
💡 Works with ANY phone number - personal or business!
Need assistance? Contact support.
```

---

## Setup with Other SMS Providers

The same webhook logic works with **any SMS provider**:

### Nexmo/Vonage

Webhook format:
```json
{
  "msisdn": "+15035551234",
  "to": "+15035559876",
  "text": "/export batch-1"
}
```

Parse as:
```javascript
const from = req.body.msisdn;
const body = req.body.text;
```

### Plivo

Webhook format:
```json
{
  "From": "+15035551234",
  "To": "+15035559876",
  "Text": "/export batch-1"
}
```

Parse as:
```javascript
const from = req.body.From;
const body = req.body.Text;
```

### MessageBird

Webhook format:
```json
{
  "originator": "+15035551234",
  "recipient": "+15035559876",
  "body": "/export batch-1"
}
```

Parse as:
```javascript
const from = req.body.originator;
const body = req.body.body;
```

---

## Security Best Practices

### 1. Verify Twilio Signature

```javascript
const twilio = require('twilio');

app.post('/sms/webhook', (req, res) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = 'https://your-domain.com/sms/webhook';

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    return res.status(403).send('Forbidden');
  }

  // Process SMS...
});
```

### 2. Rate Limiting

Prevent spam:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes per phone
  keyGenerator: (req) => req.body.From
});

app.post('/sms/webhook', limiter, async (req, res) => {
  // Process SMS...
});
```

### 3. Batch Access Control

Only allow users to export their own batches:

```javascript
// In Firestore, add a field linking batches to phone numbers
const batchDoc = await db
  .collection('batches')
  .where('phoneNumber', '==', from)
  .where('id', '==', batchId)
  .get();

if (batchDoc.empty) {
  reply = '❌ Batch not found or you don\'t have access';
}
```

---

## Cost Comparison

| Provider | Monthly Cost | Per SMS Cost | Notes |
|----------|-------------|--------------|-------|
| Twilio | $1.00 | $0.0075 | Most popular, excellent docs |
| Nexmo/Vonage | $1.00 | $0.0080 | Good alternative |
| Plivo | $0.80 | $0.0065 | Cheapest option |
| MessageBird | $1.50 | $0.0070 | Good international support |

**Example monthly cost:**
- 100 commands/month = $1.75 total (Twilio)
- 500 commands/month = $4.75 total (Twilio)
- Very affordable!

---

## Hybrid: SMS + WhatsApp

You can support **both** SMS and WhatsApp with the same code:

```javascript
// SMS webhook (personal or business numbers)
app.post('/sms/webhook', async (req, res) => {
  const command = parseCommand(req.body.Body, req.body.From, 'sms');
  // ... process
});

// WhatsApp webhook (WhatsApp Business API users)
app.post('/whatsapp/webhook', async (req, res) => {
  const command = parseCommand(req.body.Body, req.body.From, 'whatsapp');
  // ... process
});
```

**The command processing is exactly the same!** The only difference is the delivery method.

---

## Client Instructions

Give this to your clients:

### For Importers Using Personal Numbers

```
📱 How to Export Your Batch via SMS

1. Send a text message to: +1 (503) 555-9876

2. Type this command:
   /export batch-1

   (Replace "batch-1" with your actual batch ID)

3. You'll receive links to:
   📄 Google Doc (customs document with screenshots)
   📊 Google Sheet (all extracted data)

4. Download and submit to customs!

💡 Works from ANY phone - no app needed!
```

### For Email Delivery

```
Want it emailed instead?

Send this command:
/export batch-1 email:yourname@example.com

The documents will be sent to your email.
```

---

## Troubleshooting

### SMS Not Received

1. Check Twilio logs (Console > Monitor > Logs)
2. Verify webhook URL is correct
3. Ensure webhook endpoint is publicly accessible
4. Check for HTTPS (Twilio requires HTTPS)

### Commands Not Working

1. Check webhook logs for incoming messages
2. Verify command syntax (`/export batch-1`)
3. Ensure batch ID exists and is accessible
4. Check Firestore rules

### Delivery Failures

1. Verify `VITE_DELIVERY_WEBHOOK_URL` is set
2. Check delivery webhook logs
3. Ensure phone number is in E.164 format (+15035551234)

---

## Advanced: Automatic Phone Number Linking

Link batches to phone numbers automatically when screenshots are received:

```javascript
// When screenshot received via WhatsApp
const screenshotData = {
  batchId: 'batch-1',
  phoneNumber: from,  // Save sender's phone
  organizationId: 'org-123',
  // ... other fields
};

// Later, only allow that phone number to export
const batch = await db
  .collection('batches')
  .where('id', '==', batchId)
  .where('phoneNumber', '==', from)
  .get();
```

---

## Summary

✅ **Setup Steps:**
1. Get Twilio number (~$1/month)
2. Deploy webhook endpoint (Firebase/Vercel/Express)
3. Configure Twilio to call your webhook
4. Test with `/help` command

✅ **Advantages:**
- Works with ANY phone number (personal or business)
- No WhatsApp Business account needed
- Same commands, same features
- Very affordable ($1-5/month for most users)

✅ **Client Experience:**
- Send `/export batch-1` via SMS
- Receive Google Doc + Sheet links back
- Download and submit to customs
- No app installation required

**Perfect for importers using personal WhatsApp numbers!**

---

**Need help?** Contact ImportFlow support or refer to:
- [WHATSAPP_COMMANDS.md](./WHATSAPP_COMMANDS.md) - WhatsApp setup
- [Twilio SMS Docs](https://www.twilio.com/docs/sms)
- [Firebase Functions](https://firebase.google.com/docs/functions)
