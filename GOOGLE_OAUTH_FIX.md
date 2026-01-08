# Fix: Google Docs Export OAuth Error

## Problem
Export failing with: "Request had invalid authentication credentials. Expected OAuth 2 access token..."

## Root Cause
Missing Google OAuth credentials in your `.env` file. The system can't refresh your access token without valid `CLIENT_ID` and `CLIENT_SECRET`.

---

## Solution: Set Up Google OAuth Credentials

### Step 1: Create Google Cloud Project OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Select or Create a Project**
   - Use your existing Firebase project OR create a new one
   - Note the project ID

3. **Enable Required APIs**
   - Go to: **APIs & Services** → **Library**
   - Search and enable these APIs:
     - ✅ **Google Docs API**
     - ✅ **Google Drive API**
     - ✅ **Google Sheets API**

4. **Configure OAuth Consent Screen**
   - Go to: **APIs & Services** → **OAuth consent screen**
   - Choose **External** (unless you have Google Workspace)
   - Fill in required fields:
     - App name: `El Salvador Package Manager`
     - User support email: Your email
     - Developer contact: Your email
   - Click **Save and Continue**
   - Add scopes:
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/drive.file`
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/documents`
   - Click **Save and Continue**
   - Add test users (your email address)
   - Click **Save and Continue**

5. **Create OAuth Client ID**
   - Go to: **APIs & Services** → **Credentials**
   - Click: **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `Package Manager Web Client`
   - **Authorized JavaScript origins:**
     ```
     http://localhost:5176
     ```
   - **Authorized redirect URIs:**
     ```
     http://localhost:5176/oauth/callback
     ```
   - Click **CREATE**
   - **COPY** the Client ID and Client Secret (you'll need these!)

6. **Create API Key** (for Google APIs)
   - In the same **Credentials** page
   - Click: **+ CREATE CREDENTIALS** → **API key**
   - Copy the API key
   - Click **RESTRICT KEY** (optional but recommended)
     - Set application restrictions: HTTP referrers
     - Add: `http://localhost:5176/*`
     - API restrictions: Restrict to Google Docs API, Drive API, Sheets API
   - Click **SAVE**

---

### Step 2: Update Your .env File

I've created a `.env` file for you. Now update it with your actual credentials:

```bash
# Open .env file and replace these values:

# Your existing Firebase config (you should already have these)
VITE_FIREBASE_API_KEY=AIzaSyAh1nAKfnvNpd8Vml0I7-FLu-gdGiWiJ7M
VITE_FIREBASE_AUTH_DOMAIN=el-salvador-package-manager.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=el-salvador-package-manager
VITE_FIREBASE_STORAGE_BUCKET=el-salvador-package-manager.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=49391304640
VITE_FIREBASE_APP_ID=1:49391304640:web:59cfbe5205d02e76281225

# Your existing Gemini API key (you should already have this)
VITE_GEMINI_API_KEY=AIza...  # From Google AI Studio

# NEW - Google OAuth Credentials (from Step 1)
VITE_GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=GOCSPX-abc123...  # KEEP THIS SECRET!
VITE_GOOGLE_API_KEY=AIza...  # API Key from Step 1.6
VITE_GOOGLE_REDIRECT_URI=http://localhost:5176/oauth/callback
```

**Important Notes:**
- The `VITE_GOOGLE_API_KEY` might be the same as your Firebase API key
- Never commit the `.env` file to version control (it's already in `.gitignore`)
- The Client Secret is sensitive - keep it secure

---

### Step 3: Deploy Firebase Storage Rules

Your storage rules are configured but need to be deployed to Firebase:

```bash
# Make sure you're logged in to Firebase
firebase login

# Deploy storage rules
firebase deploy --only storage
```

If you get an error about Firebase project not found, initialize first:

```bash
firebase use --add
# Select your Firebase project
# Give it an alias (e.g., "default")

# Then deploy
firebase deploy --only storage
```

---

### Step 4: Restart Development Server

After updating `.env`, restart your dev server:

```bash
# Press Ctrl+C to stop the current server
# Then restart:
npm run dev
```

**Why?** Vite only loads environment variables on startup. Changes to `.env` require a restart.

---

### Step 5: Reconnect Google Account

1. **Open the app** (http://localhost:5176)
2. **Go to Settings page**
3. **If already connected:**
   - Click **"Disconnect Google Account"**
   - Wait for confirmation
4. **Click "Connect Google Account"**
5. **Complete OAuth flow:**
   - You'll be redirected to Google
   - Sign in with your Google account
   - Grant permissions
   - You'll be redirected back
6. **Verify connection:**
   - Should see green "Connected" status
   - Should see your email address

---

### Step 6: Test Export

1. **Go to Order Management**
2. **Select some rows** (with screenshots)
3. **Click "📄 Export Selected"**
4. **Should see:**
   - Success message
   - Google Doc opens in new tab
   - Data is properly formatted

---

## Troubleshooting

### Error: "Google Client ID not configured"
- Check your `.env` file has `VITE_GOOGLE_CLIENT_ID`
- Restart dev server (Ctrl+C, then `npm run dev`)

### Error: "Failed to refresh token"
- Your Client Secret might be wrong
- Check `.env` file has correct `VITE_GOOGLE_CLIENT_SECRET`
- Reconnect your Google account in Settings

### Error: "No refresh token available"
- Disconnect and reconnect your Google account
- Make sure OAuth consent screen has all required scopes

### Redirect URI Mismatch
- Check your authorized redirect URIs in Google Cloud Console
- Must exactly match: `http://localhost:5176/oauth/callback`
- Include trailing `/callback` and use `http://` not `https://`

### Still Getting "Invalid authentication credentials"
1. Clear browser cookies/cache
2. Disconnect Google account
3. Restart dev server
4. Reconnect Google account

---

## Security Reminder

⚠️ **NEVER commit your `.env` file to version control!**

The `.env` file contains sensitive credentials. It's already in `.gitignore`, but double-check:

```bash
# Verify .env is ignored
git status
# Should NOT show .env file

# If it shows .env, add to .gitignore:
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Ensure .env is ignored"
```

---

## What Changed?

I've created the `.env` file for you with placeholders. You need to:

1. ✅ Get Google OAuth credentials from Google Cloud Console
2. ✅ Update `.env` with your actual credentials
3. ✅ Deploy Firebase Storage rules
4. ✅ Restart dev server
5. ✅ Reconnect Google account in Settings

Once complete, Google Docs export will work perfectly!
