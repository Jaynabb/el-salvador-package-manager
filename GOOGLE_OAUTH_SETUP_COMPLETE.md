# Google OAuth Setup Guide - Complete Configuration

This guide will help you configure Google OAuth for ImportFlow so organization owners can connect their Google Drive accounts.

## 🎯 What You'll Enable

- Organization owners can connect their Google Drive accounts
- Auto-create ImportFlow folder in their Drive
- Auto-create tracking spreadsheet
- Export orders to Google Docs
- Full integration with Google Sheets, Docs, and Drive APIs

---

## Step 1: Access Google Cloud Console

1. Go to: https://console.cloud.google.com/
2. Select your project: **importflow**
3. If prompted, enable billing (required for OAuth)

---

## Step 2: Configure OAuth Consent Screen

1. Navigate to: **APIs & Services** > **OAuth consent screen**
2. Configure the following:

### User Type
- Select: **External** (allows any Google account to connect)
- Click **CREATE**

### App Information
- **App name:** `ImportFlow Package Manager`
- **User support email:** Your email (e.g., jay@tastybuilds.com)
- **App logo:** (Optional) Upload your logo
- **Application home page:** `https://importflow-app.web.app`
- **Application privacy policy:** `https://importflow-app.web.app/privacy` (create this page)
- **Application terms of service:** `https://importflow-app.web.app/terms` (create this page)

### Developer Contact Information
- **Email addresses:** Your email

### Scopes
Click **ADD OR REMOVE SCOPES** and add these scopes:

**Required Scopes:**
- ✅ `https://www.googleapis.com/auth/userinfo.email` - View your email address
- ✅ `https://www.googleapis.com/auth/drive.file` - Create and manage files
- ✅ `https://www.googleapis.com/auth/spreadsheets` - View and manage spreadsheets
- ✅ `https://www.googleapis.com/auth/documents` - View and manage documents

Click **UPDATE** then **SAVE AND CONTINUE**

### Test Users (For Development)
While in "Testing" mode, add test users:
- Add your email
- Add any other Google accounts that need to test OAuth

Click **SAVE AND CONTINUE**

---

## Step 3: Create OAuth 2.0 Credentials

1. Navigate to: **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. Configure:

### Application type
- Select: **Web application**

### Name
- Enter: `ImportFlow Web Client`

### Authorized JavaScript origins
Add BOTH of these URLs:
```
https://importflow-app.web.app
http://localhost:5173
```

### Authorized redirect URIs
Add BOTH of these URLs (CRITICAL - Must match exactly):
```
https://importflow-app.web.app/oauth/callback
http://localhost:5173/oauth/callback
```

4. Click **CREATE**
5. **SAVE YOUR CREDENTIALS:**
   - Copy the **Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)
   - Copy the **Client Secret** (looks like: `GOCSPX-xxxxx`)

---

## Step 4: Enable Required APIs

Navigate to: **APIs & Services** > **Library**

Search for and **ENABLE** these APIs:
1. ✅ **Google Drive API**
2. ✅ **Google Sheets API**
3. ✅ **Google Docs API**
4. ✅ **Google+ API** (for user info)

---

## Step 5: Update Your .env File

Open your `.env` file and update these values:

```bash
# Use the credentials you saved from Step 3
VITE_GOOGLE_CLIENT_ID=your_actual_client_id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=GOCSPX-your_actual_client_secret

# Your Google Cloud API Key (from Credentials page)
VITE_GOOGLE_API_KEY=AIzaSy...your_api_key

# Your Google Cloud Project Number
VITE_GOOGLE_APP_ID=your_project_number

# Production redirect URI
VITE_GOOGLE_REDIRECT_URI=https://importflow-app.web.app/oauth/callback
```

**For local development**, temporarily change the redirect URI to:
```bash
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback
```

**⚠️ IMPORTANT:** Always switch back to production URL before deploying!

---

## Step 6: Testing OAuth Flow

### In Development (localhost):
1. Set `.env` redirect URI to `http://localhost:5173/oauth/callback`
2. Run `npm run dev`
3. Log in as organization owner
4. Go to Organization tab
5. Click "Connect Google Drive"
6. Should open Google OAuth consent screen
7. Grant permissions
8. Should redirect back and show "Connected" status

### In Production (importflow-app.web.app):
1. Set `.env` redirect URI to `https://importflow-app.web.app/oauth/callback`
2. Run `npm run build`
3. Run `firebase deploy --only hosting`
4. Test same flow on live site

---

## Common Issues & Solutions

### Issue: "This app isn't verified"
**Solution:** This is normal during development. Click "Advanced" > "Go to ImportFlow (unsafe)" to continue testing.

**To Remove This Warning (Production):**
1. Complete OAuth verification in Google Cloud Console
2. Submit app for verification (requires privacy policy & terms of service)
3. Usually takes 3-5 business days

### Issue: "redirect_uri_mismatch"
**Solution:**
- Make sure `.env` VITE_GOOGLE_REDIRECT_URI matches EXACTLY what's in Google Cloud Console
- Must include `/oauth/callback` at the end
- Protocol (http/https) must match
- Port number must match (5173 for Vite dev server)

### Issue: "Access denied"
**Solution:**
- Make sure all required scopes are added to OAuth consent screen
- Check that user's email is added to test users (if app is in Testing mode)

### Issue: "API not enabled"
**Solution:**
- Go to APIs & Services > Library
- Enable Google Drive API, Sheets API, and Docs API

---

## Publishing Your App (Optional)

Once you're ready for production:

1. **Verify Domain Ownership:**
   - Go to: **OAuth consent screen** > **Authorized domains**
   - Add: `importflow-app.web.app`
   - Follow verification instructions (add TXT record to DNS or upload HTML file)

2. **Submit for Verification:**
   - Go to: **OAuth consent screen**
   - Fill out all required fields
   - Add privacy policy and terms of service URLs
   - Click **SUBMIT FOR VERIFICATION**
   - Wait 3-5 business days for Google review

3. **Switch to Production:**
   - After approval, change publishing status from "Testing" to "In production"
   - Remove test user restrictions
   - All Google accounts can now connect

---

## Quick Reference

### Your OAuth Settings
- **Client ID:** Check `.env` file
- **Redirect URIs:**
  - Production: `https://importflow-app.web.app/oauth/callback`
  - Development: `http://localhost:5173/oauth/callback`

### Console Links
- OAuth Credentials: https://console.cloud.google.com/apis/credentials?project=importflow
- OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent?project=importflow
- API Library: https://console.cloud.google.com/apis/library?project=importflow

---

## Next Steps

After completing this setup:
1. ✅ Test OAuth flow in development
2. ✅ Test OAuth flow in production
3. ✅ Verify Drive folder creation
4. ✅ Verify tracking sheet creation
5. ✅ Test order export functionality

**Need Help?**
- Google OAuth Documentation: https://developers.google.com/identity/protocols/oauth2
- Google Drive API: https://developers.google.com/drive/api/guides/about-sdk
