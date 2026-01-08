# Quick Start: WhatsApp to Google Docs Integration

Get your WhatsApp integration running in **30 minutes**.

## What You'll Get

- 📱 Receive package photos via WhatsApp
- 🤖 Automatic AI extraction of package details
- 📄 Auto-generate Google Docs (one per package)
- 📊 Sync to Google Sheets (existing feature)
- 💰 Automatic customs duty calculation

---

## Step 1: Deploy Cloud Functions (10 min)

### 1.1 Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 1.2 Deploy Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

### 1.3 Save Function URLs

After deployment, you'll see:
```
✔ functions[processWhatsAppImage]: https://us-central1-YOUR-PROJECT.cloudfunctions.net/processWhatsAppImage
```

**Copy this URL** - you'll need it for Make.com!

---

## Step 2: Configure APIs (5 min)

### 2.1 Enable Google Docs API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Navigate to **APIs & Services** → **Library**
4. Search and enable:
   - **Google Docs API**
   - **Google Drive API**

### 2.2 Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Name: `docs-creator`
4. Role: **Editor**
5. Create key (JSON)
6. Download the key file

### 2.3 Set Firebase Config

```bash
# Set Gemini API key
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"

# Set Google credentials
firebase functions:config:set google.credentials="$(cat path/to/service-account.json)"

# Redeploy with new config
firebase deploy --only functions
```

---

## Step 3: Set Up Make.com (10 min)

### 3.1 Create Make.com Account

1. Sign up at [make.com](https://www.make.com/) (free plan is fine)

### 3.2 Create New Scenario

1. Click **Create a new scenario**
2. Add these modules:

#### Module 1: WhatsApp → Watch Messages
- Filter: Message type = **image**

#### Module 2: HTTP → Get a file
- URL: `{{message.media.url}}`

#### Module 3: Tools → Set variable
- Name: `imageBase64`
- Value: `{{base64(2.data)}}`

#### Module 4: HTTP → Make a request
- URL: `YOUR_CLOUD_FUNCTION_URL/processWhatsAppImage`
- Method: `POST`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "customerPhone": "{{message.from}}",
  "customerName": "{{message.name}}",
  "imageBase64": "{{imageBase64}}",
  "imageType": "image/png"
}
```

#### Module 5: WhatsApp → Send a Message
- To: `{{message.from}}`
- Message:
```
✅ Package received!
Tracking: {{4.trackingNumber}}
View details: {{4.googleDocUrl}}
```

### 3.3 Connect WhatsApp

**Option A: Use Twilio (Easiest)**
1. Sign up at [twilio.com](https://www.twilio.com/)
2. Get WhatsApp sandbox number
3. Connect in Make.com

**Option B: Use Meta WhatsApp Business API**
1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Create business app
3. Add WhatsApp product
4. Connect in Make.com

### 3.4 Activate

1. Click **Scheduling** → **On**
2. Save scenario

---

## Step 4: Update Frontend (5 min)

### 4.1 Add Environment Variable

In `.env.local`:
```env
VITE_GOOGLE_DOCS_FUNCTION_URL=https://us-central1-YOUR-PROJECT.cloudfunctions.net
```

### 4.2 Restart Dev Server

```bash
npm run dev
```

---

## Step 5: Test Everything (5 min)

### 5.1 Send Test WhatsApp

1. Send a package photo to your WhatsApp number
2. Wait 5-10 seconds

### 5.2 Verify Results

Check:
- ✅ Make.com execution log (should show success)
- ✅ Firebase Console → Firestore (new package document)
- ✅ Google Docs (new document created)
- ✅ Google Sheets (new row added)
- ✅ WhatsApp reply received

### 5.3 View Logs

```bash
firebase functions:log
```

Look for:
```
Processing WhatsApp image for customer: +503...
Created package: abc123
Created Google Doc: https://docs.google.com/document/d/...
```

---

## Troubleshooting

### "Permission denied" on Google Docs

**Fix:**
```bash
# Re-upload service account credentials
firebase functions:config:set google.credentials="$(cat service-account.json)"
firebase deploy --only functions
```

### "Gemini API error"

**Fix:**
```bash
# Verify API key is set
firebase functions:config:get gemini.api_key

# If not set or wrong:
firebase functions:config:set gemini.api_key="YOUR_REAL_KEY"
firebase deploy --only functions
```

### Make.com not triggering

**Fix:**
1. Check WhatsApp connection in Make.com
2. Verify scenario is **activated** (green switch)
3. Test with manual "Run once"

### No Google Doc created

**Fix:**
1. Check Cloud Functions logs: `firebase functions:log`
2. Verify Google Docs API is enabled
3. Check service account has Editor role

---

## What's Next?

### Customize Google Docs Format

Edit `functions/src/services/googleDocsService.ts`:
- Change document title format
- Add your logo
- Modify sections
- Adjust styling

### Add WhatsApp Auto-Responses

In `functions/src/index.ts`, add custom responses based on package status, value, etc.

### Monitor Usage

```bash
# View function calls
firebase console

# Check costs
gcloud billing accounts list
```

### Scale Up

- Upgrade Make.com plan for more operations
- Add more WhatsApp numbers
- Enable batch processing

---

## Cost Summary

**Free tier usage:**
- Make.com: 1,000 ops/month = ~200 packages
- Cloud Functions: 2M invocations/month = unlimited for this use
- Gemini API: 60 req/min = 1,800+ packages/month
- Google Docs: 300 req/min = unlimited

**Total: FREE for small businesses!**

---

## Support

Need help?
1. Check logs: `firebase functions:log`
2. Review [WHATSAPP_INTEGRATION.md](./WHATSAPP_INTEGRATION.md)
3. Review [functions/DEPLOYMENT.md](./functions/DEPLOYMENT.md)

---

**You're all set!** 🎉

Send a package photo to your WhatsApp number and watch the magic happen!
