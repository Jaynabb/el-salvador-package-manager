# Complete SMS Command System - ImportFlow

**Full web app parity! Importers never need to open the web app.**

---

## 🎯 What's New

✅ **Complete Batch Management**
- Create, delete, rename batches
- Set weight, view screenshots
- List all batches

✅ **Organization Security**
- Phone number authentication
- Only registered numbers can use commands
- Organization-level access control

✅ **Full Export Functionality**
- Export to SMS, WhatsApp, or Email
- Google Docs with embedded images
- Google Sheets with extracted data

---

## 📱 ALL Available Commands

### 🆕 BATCH MANAGEMENT

```
/create "Batch Name"
```
Create a new batch
Example: `/create "December Shipment"`
Response: Batch ID for future reference

```
/delete [batch-id]
```
Delete a batch permanently
Example: `/delete batch-1`
Response: Confirmation message

```
/rename [batch-id] "New Name"
```
Rename an existing batch
Example: `/rename batch-1 "January Shipment"`
Response: Confirmation with new name

```
/list
/batches
```
List all your batches
Example: `/list`
Response: All batches with IDs and statuses

```
/setweight [batch-id] [weight]kg|lb
```
Set batch weight
Example: `/setweight batch-1 10kg` or `/setweight batch-1 22lb`
Response: Confirmation

### 📊 BATCH INFORMATION

```
/status [batch-id]
```
Get detailed batch status
Example: `/status batch-1`
Response: Status, screenshot count, weight, ready to export

```
/screenshots [batch-id]
```
List all screenshots in a batch
Example: `/screenshots batch-1`
Response: Screenshot count, sources, extraction status

### 📤 EXPORT

```
/export [batch-id]
```
Export batch and receive via SMS/WhatsApp
Example: `/export batch-1`
Response: Google Doc URL + Google Sheets URL

```
/export [batch-id] email:[email]
```
Export batch and send to email
Example: `/export batch-1 email:user@example.com`
Response: Confirmation + URLs sent to email

### 👤 ACCOUNT

```
/myinfo
```
Get your account information
Example: `/myinfo`
Response: Name, phone, organization, role

### ❓ HELP

```
/help
help
```
Show all commands
Example: `/help`
Response: Complete command list

---

## 🔐 Phone Number Authentication

**SECURITY FEATURE: Only registered phone numbers can use commands**

### How It Works

1. **Admin registers phone number** in Settings → SMS Access
2. **System creates phoneAuth record** linking phone to organization
3. **User sends command** via SMS
4. **System verifies:**
   - Phone number is registered
   - User account is active
   - Organization is active
   - User has access to requested batch
5. **Command executes** if all checks pass
6. **Access denied** if any check fails

### Unauthorized Access

If an unregistered number tries to use commands:

```
⛔ Unauthorized Access

This phone number (+15035551234) is not registered with ImportFlow.

To get access:
1. Contact your organization admin
2. Have them add your phone number in Settings
3. Try again

Need help? Contact ImportFlow support.
```

### Registration Process

**Admins:** Add phone numbers in Settings → SMS Access

1. Enter phone number (E.164 format: +15035551234)
2. Assign user name and role
3. Save
4. User can immediately use SMS commands

**Phone Number Format:**
- US: +1 (503) 555-1234 → `+15035551234`
- El Salvador: +503 7845-1234 → `+50378451234`
- Always include country code with `+` prefix

---

## 📖 Usage Examples

### Example 1: Complete Workflow (SMS Only)

```
// Create a batch
→ /create "December Electronics"
← ✅ Batch Created!
  Name: December Electronics
  ID: batch-abc123

// Add screenshots via WhatsApp
// (Just send images to the ImportFlow WhatsApp number)

// Check status
→ /status batch-abc123
← ✅ Batch Status: December Electronics
  Status: ready
  Screenshots: 5
  Weight: 10 kg
  Ready to export!

// Export
→ /export batch-abc123
← ✅ Batch Export Ready
  📄 Document: https://docs.google.com/document/d/...
  📊 Spreadsheet: https://docs.google.com/spreadsheets/d/...
```

**User never opened the web app!**

### Example 2: Managing Multiple Batches

```
// List all batches
→ /list
← 📦 Your Batches (3 total)

  1. ✅ December Electronics
     ID: batch-abc123
     Status: ready
     Screenshots: 5

  2. ⏳ January Clothing
     ID: batch-def456
     Status: processing
     Screenshots: 3

  3. 📝 February Toys
     ID: batch-ghi789
     Status: draft
     Screenshots: 0

// Delete old batch
→ /delete batch-abc123
← ✅ Batch "December Electronics" deleted successfully.

// Rename batch
→ /rename batch-def456 "January Apparel"
← ✅ Batch renamed to "January Apparel"

// Set weight
→ /setweight batch-def456 15kg
← ✅ Weight set to 15kg for batch "January Apparel"
```

### Example 3: Export to Email

```
→ /export batch-def456 email:customs@broker.com
← ✅ Batch Exported!

  📧 Sent to: customs@broker.com

  📄 Document: https://docs.google.com/document/d/...
  📊 Spreadsheet: https://docs.google.com/spreadsheets/d/...

  Check your email for customs documents.
```

---

## 🚀 Setup Instructions

### 1. Add Phone Number Authentication to Firestore

Create a `phoneAuth` collection:

```javascript
// Firestore structure
phoneAuth/{phoneNumberId}
  phoneNumber: "+15035551234"
  organizationId: "org-123"
  userId: "user-456" (optional)
  displayName: "Juan Perez"
  role: "importer"
  active: true
  createdAt: timestamp
  lastUsed: timestamp
```

### 2. Deploy Complete SMS Handler

**Option A: Firebase Cloud Function**

```javascript
// functions/sms-webhook.js
const functions = require('firebase-functions');
const { processCompleteSMS, formatTwilioResponse } = require('./completeSMSHandler');

exports.smsWebhook = functions.https.onRequest(async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;

  const result = await processCompleteSMS(from, body);

  res.type('text/xml');
  res.send(formatTwilioResponse(result.reply));
});
```

Deploy:
```bash
firebase deploy --only functions:smsWebhook
```

**Option B: Vercel Serverless**

```javascript
// api/sms.js
import { processCompleteSMS, formatTwilioResponse } from '../src/services/completeSMSHandler';

export default async function handler(req, res) {
  const from = req.body.From;
  const body = req.body.Body;

  const result = await processCompleteSMS(from, body);

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(formatTwilioResponse(result.reply));
}
```

### 3. Configure Twilio Webhook

1. Go to Twilio Console → Phone Numbers
2. Click your number
3. Set "A MESSAGE COMES IN" webhook to your function URL
4. Method: POST
5. Save

**Webhook URLs:**
- Firebase: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/smsWebhook`
- Vercel: `https://your-app.vercel.app/api/sms`

### 4. Add Phone Numbers

**Admin users:** Go to Settings → SMS Access

1. Click "Add Phone Number"
2. Enter phone: `+15035551234`
3. Enter name: `Juan Perez`
4. Select role: `importer`
5. Save

User can immediately use SMS commands!

---

## 🔧 Firestore Security Rules

Update `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Phone auth (read-only for functions)
    match /phoneAuth/{phoneId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.role == 'admin';
    }

    // Batches (organization-scoped)
    match /batches/{batchId} {
      allow read: if request.auth != null &&
                     resource.data.organizationId == request.auth.token.organizationId;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
                               resource.data.organizationId == request.auth.token.organizationId;
    }
  }
}
```

---

## 📊 Complete Feature Matrix

| Feature | Web App | SMS Command | Status |
|---------|---------|-------------|--------|
| Create Batch | ✅ | ✅ `/create "Name"` | Complete |
| Delete Batch | ✅ | ✅ `/delete batch-id` | Complete |
| Rename Batch | ✅ | ✅ `/rename batch-id "Name"` | Complete |
| Set Weight | ✅ | ✅ `/setweight batch-id 10kg` | Complete |
| List Batches | ✅ | ✅ `/list` | Complete |
| View Status | ✅ | ✅ `/status batch-id` | Complete |
| List Screenshots | ✅ | ✅ `/screenshots batch-id` | Complete |
| Export Batch | ✅ | ✅ `/export batch-id` | Complete |
| View Account | ✅ | ✅ `/myinfo` | Complete |
| Add Screenshots | ✅ | ✅ (via WhatsApp) | Complete |

**100% Feature Parity Achieved!**

---

## 💰 Cost Estimate

**Twilio SMS Pricing:**
- Phone number: $1.00/month
- Incoming SMS: $0.0075 each
- Outgoing SMS: $0.0075 each

**Monthly cost examples:**
- 50 commands/month: ~$1.75
- 200 commands/month: ~$4.00
- 500 commands/month: ~$8.75

**Very affordable for most businesses!**

---

## 🎉 Benefits

✅ **Importer Benefits:**
- Never need to open web app
- Manage batches from anywhere
- Quick status checks
- Fast exports

✅ **Business Benefits:**
- Reduced support burden
- Faster processing
- Better customer experience
- Universal accessibility

✅ **Security Benefits:**
- Phone-based authentication
- Organization-level control
- Audit trail
- Access revocation

---

## 🆘 Troubleshooting

### Command Not Working

1. **Check phone number format**
   - Must be E.164: `+15035551234`
   - Include country code

2. **Verify registration**
   - Admin must add number in Settings
   - Check active status

3. **Check Twilio logs**
   - Console → Monitor → Logs
   - Look for webhook errors

### Unauthorized Access

**Problem:** Getting "unauthorized" message

**Solution:**
1. Contact your organization admin
2. Verify your phone number is registered
3. Check your account is active
4. Confirm organization is active

### Batch Not Found

**Problem:** Batch ID doesn't work

**Solution:**
1. Use `/list` to see all your batches
2. Check batch ID spelling
3. Verify you have access to that batch

---

## 📚 Additional Resources

- **SMS Setup:** See `SMS_SETUP.md` for basic setup
- **WhatsApp Commands:** See `WHATSAPP_COMMANDS.md` for WhatsApp version
- **VAPI Chat Widget:** See `VAPI_PROMPT_IMPORTFLOW.txt` for AI assistant
- **Command Methods:** See `COMMAND_METHODS.md` for comparison

---

## 🎯 Next Steps

1. ✅ Deploy complete SMS handler
2. ✅ Add phone authentication to Firestore
3. ✅ Configure Twilio webhook
4. ✅ Register importer phone numbers
5. ✅ Test with `/help` command
6. ✅ Train importers on SMS workflow
7. ✅ Monitor usage and optimize

**Your importers can now manage everything via SMS! 🚀**

---

**Questions?** Contact ImportFlow support or refer to the detailed setup guides.

**Last Updated:** December 2025
