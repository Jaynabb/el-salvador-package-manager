# 🔧 Google Drive Upload Setup Guide

## Error: "The API developer key is invalid"

This error means your Google API key is missing, incorrect, or not properly configured for the Google Picker API.

## Step-by-Step Setup

### 1. Go to Google Cloud Console

Visit: https://console.cloud.google.com/

### 2. Create or Select a Project

- Click the project dropdown at the top
- Either select your existing project or create a new one

### 3. Enable Required APIs

Go to **APIs & Services > Library** and enable:
- ✅ **Google Picker API** (Required for file selection)
- ✅ **Google Drive API** (Required for file download)

**Direct Links:**
- Picker API: https://console.cloud.google.com/apis/library/picker.googleapis.com
- Drive API: https://console.cloud.google.com/apis/library/drive.googleapis.com

### 4. Create API Key

1. Go to **APIs & Services > Credentials**
2. Click **+ CREATE CREDENTIALS** at the top
3. Select **API Key**
4. Copy the API key that appears
5. Click **RESTRICT KEY** (recommended for security)

#### Restrict the API Key (Security Best Practice)

1. **API restrictions**:
   - Select "Restrict key"
   - Check ✅ **Google Picker API**
   - Check ✅ **Google Drive API**

2. **Application restrictions** (optional but recommended):
   - Select "HTTP referrers (web sites)"
   - Add: `http://localhost:5176/*`
   - Add: `http://localhost:5173/*`
   - Add your production domain when deploying

### 5. Create OAuth 2.0 Client ID

1. Go to **APIs & Services > Credentials**
2. Click **+ CREATE CREDENTIALS**
3. Select **OAuth client ID**
4. If prompted, configure the OAuth consent screen first:
   - User Type: **External** (or Internal if Google Workspace)
   - App name: Your app name
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `../auth/drive.readonly`

5. Back to creating OAuth client ID:
   - Application type: **Web application**
   - Name: "ImportFlow Web Client"
   - Authorized JavaScript origins:
     - `http://localhost:5176`
     - `http://localhost:5173`
     - Add your production domain later
   - Authorized redirect URIs:
     - `http://localhost:5176/oauth/callback`
     - `http://localhost:5173/oauth/callback`

6. Copy the **Client ID** and **Client Secret**

### 6. Get Project Number (App ID)

1. Go to **IAM & Admin > Settings**
2. Copy the **Project number** (this is your App ID)

### 7. Update Your .env File

Create a `.env` file in your project root (copy from `.env.example`) and add:

```env
# Google OAuth Integration
VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnop.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=GOCSPX-aBcDeFgHiJkLmNoPqRsTuVwXyZ
VITE_GOOGLE_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
VITE_GOOGLE_APP_ID=123456789012
VITE_GOOGLE_REDIRECT_URI=http://localhost:5176/oauth/callback
```

**Important**: Replace all placeholder values with your actual credentials!

### 8. Restart Your Dev Server

After updating `.env`:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Verification

1. Go to the Upload tab
2. Click on "Upload from Google Drive"
3. You should see the Google account picker
4. After signing in, you should see the file picker

## Common Issues

### "The API developer key is invalid"
- ❌ API key is missing from `.env`
- ❌ API key has not been enabled for Picker API
- ❌ API key restrictions are too strict
- ✅ Solution: Follow steps 3-4 above

### "Access blocked: This app's request is invalid"
- ❌ OAuth consent screen not configured
- ❌ Redirect URI not in authorized list
- ✅ Solution: Follow step 5 above

### "Failed to load Google APIs"
- ❌ Scripts blocked by ad blocker
- ❌ Network connectivity issues
- ✅ Solution: Disable ad blocker, check internet connection

### Picker opens but can't select files
- ❌ Missing Drive API scope
- ❌ User hasn't granted Drive access
- ✅ Solution: Re-authenticate, check OAuth scopes

## Security Notes

1. **Never commit .env to git** - It's already in `.gitignore`
2. **Restrict API keys** - Limit to specific APIs and domains
3. **Use different credentials** for development and production
4. **Rotate keys** if they're exposed

## Testing

After setup, test the upload flow:

1. Click "Upload from Google Drive"
2. Sign in with your Google account
3. Select one or more image files
4. Files should download and appear in the upload grid
5. Assign customer names and process

## Need Help?

If you're still having issues:

1. Check the browser console for detailed error messages
2. Verify all APIs are enabled in Google Cloud Console
3. Ensure credentials match exactly (no extra spaces)
4. Try creating a new API key if the current one doesn't work

---

**Last Updated**: December 2025
