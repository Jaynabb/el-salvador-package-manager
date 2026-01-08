# Cloud Functions - WhatsApp Integration

Firebase Cloud Functions for processing WhatsApp images and creating Google Docs.

## Functions

### 1. `processWhatsAppImage`
**Receives WhatsApp images from Make.com automation**

**Endpoint:** `POST /processWhatsAppImage`

**Request:**
```json
{
  "customerPhone": "+503 XXXX-XXXX",
  "customerName": "John Doe",
  "imageBase64": "base64_encoded_image_data",
  "imageType": "image/png"
}
```

**Response:**
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

**What it does:**
1. Finds or creates customer by phone number
2. Analyzes image with Gemini AI
3. Extracts package details
4. Calculates customs duties
5. Saves to Firestore
6. Creates Google Doc
7. Logs activity

---

### 2. `createPackageDoc`
**Creates Google Docs for packages (called from frontend)**

**Endpoint:** `POST /createPackageDoc`

**Request:**
```json
{
  "packageData": {
    "id": "abc123",
    "trackingNumber": "US1234567890",
    "customerName": "John Doe",
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "docUrl": "https://docs.google.com/document/d/...",
  "message": "Google Doc created successfully"
}
```

---

## Project Structure

```
functions/
├── src/
│   ├── index.ts              # Main entry point, function definitions
│   ├── types.ts              # TypeScript interfaces
│   ├── services/
│   │   ├── geminiService.ts  # AI image analysis
│   │   └── googleDocsService.ts  # Google Docs creation
│   └── utils/
│       └── dutyCalculator.ts # Customs duty calculations
├── package.json
├── tsconfig.json
└── DEPLOYMENT.md
```

---

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

Compiles TypeScript from `src/` to JavaScript in `lib/`.

### Local Testing

```bash
# Start Firebase emulators
firebase emulators:start --only functions

# Test locally
curl http://localhost:5001/YOUR-PROJECT/us-central1/processWhatsAppImage \
  -X POST \
  -H "Content-Type: application/json" \
  -d @test-data.json
```

### Deploy

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:processWhatsAppImage
```

---

## Environment Variables

Set via Firebase CLI:

```bash
# Gemini API Key
firebase functions:config:set gemini.api_key="YOUR_KEY"

# Google Service Account
firebase functions:config:set google.credentials="$(cat service-account.json)"

# Verify
firebase functions:config:get
```

---

## Dependencies

### Production
- `firebase-admin` - Firestore access
- `firebase-functions` - Cloud Functions framework
- `@google/generative-ai` - Gemini AI for image analysis
- `googleapis` - Google Docs/Drive APIs
- `cors` - Cross-origin requests

### Development
- `typescript` - TypeScript compiler
- `@types/*` - Type definitions
- `eslint` - Code linting

---

## Cost Estimates

**Per 1,000 packages:**
- Cloud Functions: $0.40 (invocations) + $0.10 (compute) = **$0.50**
- Gemini API: $0.25 (image analysis) = **$0.25**
- Google Docs API: **Free**

**Total: ~$0.75 per 1,000 packages**

**Free tier covers:**
- 2M function invocations/month
- 400K GB-seconds compute
- 60 Gemini requests/minute

Most small businesses stay within free tier!

---

## Error Handling

All functions include:
- ✅ Input validation
- ✅ Try-catch error handling
- ✅ Detailed error logging
- ✅ Proper HTTP status codes

Example error response:
```json
{
  "error": "Failed to process image",
  "details": "Invalid base64 encoding"
}
```

---

## Monitoring

### View Logs

```bash
# Real-time logs
firebase functions:log

# Specific function
firebase functions:log --only processWhatsAppImage

# Filter errors
firebase functions:log | grep ERROR
```

### Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project → **Functions**
3. View metrics, logs, and usage

---

## Testing

### Test Data

Create `test-data.json`:
```json
{
  "customerPhone": "+503 7777-8888",
  "customerName": "Test User",
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "imageType": "image/png"
}
```

### Run Test

```bash
curl -X POST https://YOUR-FUNCTION-URL/processWhatsAppImage \
  -H "Content-Type: application/json" \
  -d @test-data.json
```

---

## Security

### Best Practices Implemented

1. **CORS enabled** - Allows frontend requests
2. **Input validation** - All inputs checked
3. **Error sanitization** - No sensitive data in errors
4. **Service account** - Limited permissions

### Additional Security (Optional)

Add webhook secret verification:

```typescript
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

---

## Troubleshooting

### Common Issues

**Build errors:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Deployment fails:**
```bash
firebase deploy --only functions --debug
```

**Permission errors:**
- Check service account has Editor role
- Verify APIs are enabled
- Re-upload credentials

**Timeout errors:**
- Increase timeout in function config
- Optimize image size
- Add more memory

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting.

---

## Contributing

1. Make changes in `src/`
2. Build: `npm run build`
3. Test locally: `firebase emulators:start --only functions`
4. Deploy: `firebase deploy --only functions`

---

## Support

- **Logs:** `firebase functions:log`
- **Documentation:** [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Firebase Docs:** https://firebase.google.com/docs/functions

---

**Last updated:** November 2025
