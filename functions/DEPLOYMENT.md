# Firebase Cloud Functions Deployment Guide

Quick guide to deploy the WhatsApp integration Cloud Functions.

## Prerequisites

- Node.js 20 or higher
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project created
- Google Cloud billing enabled

## Initial Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment Variables

Set required environment variables for Cloud Functions:

```bash
# Gemini API Key (required for AI extraction)
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"

# Google Service Account Credentials (required for Google Docs)
# First, download service account key from Google Cloud Console
firebase functions:config:set google.credentials="$(cat path/to/service-account-key.json)"

# Verify configuration
firebase functions:config:get
```

### 3. Enable Required APIs

Go to [Google Cloud Console](https://console.cloud.google.com/) and enable:

1. **Google Docs API**
   - Navigate to APIs & Services → Library
   - Search "Google Docs API"
   - Click Enable

2. **Google Drive API**
   - Search "Google Drive API"
   - Click Enable

3. **Cloud Functions API**
   - Should already be enabled
   - Verify in APIs & Services

### 4. Service Account Setup

1. Go to **IAM & Admin** → **Service Accounts**
2. Create service account:
   - Name: `package-manager-functions`
   - Role: **Editor** (or custom role with Docs/Drive permissions)
3. Create key (JSON format)
4. Download and save securely

## Build and Deploy

### Build TypeScript

```bash
npm run build
```

This compiles TypeScript files in `src/` to JavaScript in `lib/`.

### Deploy All Functions

```bash
firebase deploy --only functions
```

### Deploy Specific Function

```bash
# Deploy only WhatsApp webhook
firebase deploy --only functions:processWhatsAppImage

# Deploy only Google Docs creator
firebase deploy --only functions:createPackageDoc
```

## Function URLs

After deployment, Firebase will provide URLs:

```
✔  functions[us-central1-processWhatsAppImage]: https://us-central1-PROJECT-ID.cloudfunctions.net/processWhatsAppImage
✔  functions[us-central1-createPackageDoc]: https://us-central1-PROJECT-ID.cloudfunctions.net/createPackageDoc
```

**Save these URLs!** You'll need them for:
- Make.com automation (`processWhatsAppImage`)
- Frontend integration (`createPackageDoc`)

## Testing Functions

### Test WhatsApp Image Processing

Using curl:

```bash
curl -X POST https://us-central1-PROJECT-ID.cloudfunctions.net/processWhatsAppImage \
  -H "Content-Type: application/json" \
  -d '{
    "customerPhone": "+503 7777-8888",
    "customerName": "Test Customer",
    "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }'
```

Expected response:
```json
{
  "success": true,
  "packageId": "abc123",
  "trackingNumber": "WA-1234567890",
  "googleDocUrl": "https://docs.google.com/document/d/...",
  "extractedData": {
    "items": [...],
    "totalValue": 100.00,
    "customsDuty": 0,
    "vat": 13.00,
    "totalFees": 13.00
  }
}
```

### Test Google Doc Creation

```bash
curl -X POST https://us-central1-PROJECT-ID.cloudfunctions.net/createPackageDoc \
  -H "Content-Type: application/json" \
  -d @test-package.json
```

## Monitoring

### View Logs

```bash
# Real-time logs
firebase functions:log

# Specific function logs
firebase functions:log --only processWhatsAppImage

# Logs from last hour
firebase functions:log --since 1h
```

### Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Functions**
4. View usage, errors, and performance metrics

### Error Tracking

Check logs for common errors:

```bash
firebase functions:log | grep ERROR
```

## Environment Configuration

### Local Development

To run functions locally:

1. Create `.runtimeconfig.json`:
   ```bash
   firebase functions:config:get > .runtimeconfig.json
   ```

2. Start emulator:
   ```bash
   firebase emulators:start --only functions
   ```

3. Test locally:
   ```bash
   curl http://localhost:5001/PROJECT-ID/us-central1/processWhatsAppImage \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```

### Production Configuration

View current config:
```bash
firebase functions:config:get
```

Update config:
```bash
firebase functions:config:set key="value"
firebase deploy --only functions
```

## Troubleshooting

### Issue: "Permission denied" when creating Google Docs

**Solution:**
1. Verify service account has Editor role
2. Check credentials are set correctly:
   ```bash
   firebase functions:config:get google.credentials
   ```
3. Re-upload service account key if needed

### Issue: "Gemini API error"

**Solution:**
1. Verify API key:
   ```bash
   firebase functions:config:get gemini.api_key
   ```
2. Check API key is valid at [Google AI Studio](https://aistudio.google.com/)
3. Ensure billing is enabled

### Issue: Function timeout

**Solution:**
Increase timeout in `src/index.ts`:
```typescript
export const processWhatsAppImage = onRequest({
  timeoutSeconds: 540, // Max: 540s (9 minutes)
  memory: "1GiB",
}, ...
```

Then redeploy:
```bash
firebase deploy --only functions
```

### Issue: "Module not found"

**Solution:**
1. Clean install:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
2. Rebuild:
   ```bash
   npm run build
   ```
3. Deploy:
   ```bash
   firebase deploy --only functions
   ```

## Performance Optimization

### 1. Increase Memory

For large images:
```typescript
export const processWhatsAppImage = onRequest({
  memory: "1GiB", // Default: 256MiB
}, ...
```

### 2. Reduce Cold Starts

Set minimum instances:
```typescript
export const processWhatsAppImage = onRequest({
  minInstances: 1, // Keep warm
}, ...
```

**Note:** This increases costs!

### 3. Optimize Image Processing

Compress images before sending to Gemini:
```typescript
import sharp from 'sharp';

const compressed = await sharp(imageBuffer)
  .resize(1920, 1080, { fit: 'inside' })
  .jpeg({ quality: 85 })
  .toBuffer();
```

## Cost Monitoring

### View Usage

```bash
firebase use --add  # Switch to project
gcloud functions describe processWhatsAppImage --region=us-central1
```

### Estimate Costs

**Cloud Functions:**
- Free tier: 2M invocations/month
- $0.40 per million invocations after

**Gemini API:**
- Free tier: 60 requests/minute
- Paid: $0.00025 per image

**Google Docs API:**
- Free: Up to 300 requests/minute per project

## Security Best Practices

### 1. Add Request Validation

```typescript
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

### 2. Rate Limiting

Install:
```bash
npm install express-rate-limit
```

Use in function:
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

### 3. Input Sanitization

Always validate inputs:
```typescript
if (!customerPhone || !imageBase64) {
  res.status(400).json({ error: 'Invalid input' });
  return;
}
```

## Updating Functions

### Update Code

1. Make changes in `src/`
2. Build:
   ```bash
   npm run build
   ```
3. Test locally:
   ```bash
   firebase emulators:start --only functions
   ```
4. Deploy:
   ```bash
   firebase deploy --only functions
   ```

### Rollback

If deployment fails:
```bash
firebase functions:delete functionName
firebase deploy --only functions:functionName
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy-functions.yml`:

```yaml
name: Deploy Functions

on:
  push:
    branches: [main]
    paths:
      - 'functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
        working-directory: functions
      - run: npm run build
        working-directory: functions
      - uses: w9jds/firebase-action@master
        with:
          args: deploy --only functions
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

Get Firebase token:
```bash
firebase login:ci
```

## Support

For issues:
1. Check logs: `firebase functions:log`
2. Review [Firebase documentation](https://firebase.google.com/docs/functions)
3. Check [Stack Overflow](https://stackoverflow.com/questions/tagged/google-cloud-functions)

---

**Last updated:** November 2025
