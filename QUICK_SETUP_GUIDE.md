# Quick Setup Guide - Google OAuth Integration

Follow these steps exactly to get Google OAuth working.

## Step 1: Go to Google Cloud Console

1. Open https://console.cloud.google.com
2. Sign in with your Google account

## Step 2: Select or Create a Project

1. At the top of the page, click the project dropdown
2. Either:
   - Select your existing Firebase project, OR
   - Click "New Project", name it "ImportFlow", and click Create

## Step 3: Enable Required APIs

1. In the left sidebar, click **APIs & Services** > **Library**
2. Search for "Google Drive API" and click it
3. Click **ENABLE**
4. Go back and search for "Google Sheets API"
5. Click **ENABLE**
6. Go back and search for "Google Docs API"
7. Click **ENABLE**

## Step 4: Configure OAuth Consent Screen

1. In the left sidebar, click **APIs & Services** > **OAuth consent screen**
2. Select **External** and click **CREATE**
3. Fill in:
   - **App name**: ImportFlow
   - **User support email**: (your email)
   - **Developer contact**: (your email)
4. Click **SAVE AND CONTINUE**
5. On the Scopes page, click **ADD OR REMOVE SCOPES**
6. In the filter, search for each of these and check the box:
   - `.../auth/drive.file` (View and manage Google Drive files)
   - `.../auth/spreadsheets` (View and manage spreadsheets)
   - `.../auth/documents` (View and manage Google Docs)
7. Click **UPDATE** then **SAVE AND CONTINUE**
8. On Test users page, click **ADD USERS**
9. Add your Gmail address (the one you'll test with)
10. Click **SAVE AND CONTINUE**

## Step 5: Create OAuth Client ID

1. In the left sidebar, click **APIs & Services** > **Credentials**
2. Click **CREATE CREDENTIALS** > **OAuth client ID**
3. Select **Application type**: **Web application**
4. Name: "ImportFlow Web Client"
5. Under **Authorized JavaScript origins**, click **ADD URI**:
   - Add: `http://localhost:5173`
6. Under **Authorized redirect URIs**, click **ADD URI**:
   - Add: `http://localhost:5173/oauth/callback`
7. Click **CREATE**
8. A popup shows your credentials - **COPY the Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)
9. Click **OK**

## Step 6: Create API Key

1. Still in **Credentials**, click **CREATE CREDENTIALS** > **API key**
2. **COPY the API key** that appears
3. Click **RESTRICT KEY**
4. Under **API restrictions**, select **Restrict key**
5. Check these APIs:
   - Google Drive API
   - Google Sheets API
   - Google Docs API
6. Click **SAVE**

## Step 7: Update Your .env.local File

1. In your project folder, find or create `.env.local`
2. Add these lines (replace with your actual values):

```bash
# Firebase Configuration (you should already have these)
VITE_FIREBASE_API_KEY=your_firebase_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Google Gemini AI (for AI scanning)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Google OAuth (PASTE YOUR VALUES HERE)
VITE_GOOGLE_CLIENT_ID=paste_your_client_id_here.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=paste_your_api_key_here
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback
```

3. Save the file

## Step 8: Test the Connection

1. Open terminal in your project folder
2. Run: `npm run dev`
3. Open browser to `http://localhost:5173`
4. Log in to ImportFlow
5. Go to **Settings** page
6. Look for "Google Drive Integration" section
7. Click **Connect Google Account**
8. Sign in with the Google account you added as a test user
9. Grant permissions
10. You should see "Connected" status

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Double-check your redirect URI is exactly: `http://localhost:5173/oauth/callback`
- Make sure you added yourself as a test user

### "Redirect URI mismatch"
- The redirect URI in your `.env.local` must match exactly what's in Google Cloud Console
- Check for typos, extra spaces, or http vs https

### "API key not found"
- Make sure you pasted the API key correctly in `.env.local`
- No spaces before or after the key

### Popup blocked
- Allow popups in your browser for localhost:5173

---

## You're Done!

Once you see "Connected" in Settings, you're ready to use automated Google Sheets and Docs export!
