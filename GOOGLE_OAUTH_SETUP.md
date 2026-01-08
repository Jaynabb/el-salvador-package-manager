# Google OAuth Setup Guide

This guide will help you set up Google OAuth integration so each importer can connect their Google account with one click - no manual script setup required!

## What This Enables

- Each importer can connect their own Google Drive account
- Packages automatically create Google Sheets in their Drive
- Packages automatically create Google Docs in their Drive
- All organized in a dedicated "ImportFlow - Package Tracking" folder
- No webhook URLs or Apps Script deployment needed

## Prerequisites

- A Google Cloud Platform account
- Your Firebase project already set up

---

## Step 1: Enable Google APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project (or create a new one)
3. Navigate to **APIs & Services** > **Library**
4. Enable the following APIs:
   - **Google Drive API**
   - **Google Sheets API**
   - **Google Docs API**

## Step 2: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen first (see Step 3)
4. Select **Application type**: **Web application**
5. Give it a name: "ImportFlow OAuth"
6. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (for development)
   - `https://yourdomain.com` (for production)
7. Under **Authorized redirect URIs**, add:
   - `http://localhost:5173/oauth/callback` (for development)
   - `https://yourdomain.com/oauth/callback` (for production)
8. Click **Create**
9. Copy the **Client ID** - you'll need this for your `.env.local` file

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (unless you have Google Workspace)
3. Fill in the required information:
   - **App name**: ImportFlow
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes**
6. Add these scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/documents`
7. Click **Save and Continue**
8. On **Test users** page:
   - While in development, add test user emails
   - In production, you can publish the app
9. Click **Save and Continue**

## Step 4: Get API Key (Optional but Recommended)

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **API Key**
3. Copy the API key
4. Click **Restrict Key** to add restrictions:
   - **Application restrictions**: HTTP referrers
     - Add: `http://localhost:5173/*` (development)
     - Add: `https://yourdomain.com/*` (production)
   - **API restrictions**: Restrict key
     - Select: Drive API, Sheets API, Docs API
5. Click **Save**

## Step 5: Update Environment Variables

Add the following to your `.env.local` file:

```bash
# Google OAuth Integration
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=YOUR_API_KEY_HERE
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback
```

**For production**, update `VITE_GOOGLE_REDIRECT_URI` to your production domain:
```bash
VITE_GOOGLE_REDIRECT_URI=https://yourdomain.com/oauth/callback
```

## Step 6: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Log in as an importer admin or user

3. Go to **Settings** page

4. You should see a **Google Drive Integration** section

5. Click **Connect Google Account**

6. A popup will open asking you to sign in with Google

7. Grant the requested permissions

8. You should see a success message and the connection status will update

9. Check your Google Drive - you should see a new folder called "ImportFlow - Package Tracking" with an initial tracking spreadsheet

## Step 7: Using the Integration

### For Importers:

1. Each importer connects their own Google account once in Settings
2. When packages are created, they automatically sync to the importer's Google Sheet
3. Package documents are created in their Google Drive folder
4. They can view/edit/share these files as needed

### Automatic Features:

- **Package Tracking Sheet**: Auto-updates when packages are added/modified
- **Package Documents**: Created automatically with formatted package details
- **Organized Storage**: All files in a dedicated ImportFlow folder
- **Token Refresh**: Access tokens auto-refresh, no re-authentication needed

## Troubleshooting

### "Access blocked: This app's request is invalid"

- Make sure all redirect URIs are correctly configured in Google Cloud Console
- Check that the OAuth consent screen is properly configured
- Verify the scopes are added

### "Popup was blocked"

- Enable popups for your domain in browser settings
- Or use the "Allow popups" option when prompted

### "Failed to connect Google account"

- Check browser console for detailed error messages
- Verify your Client ID and API Key are correct
- Ensure all required APIs are enabled
- Check that redirect URIs match exactly (including http/https)

### "No refresh token received"

- Make sure `access_type=offline` is set in the OAuth URL (already configured)
- Make sure `prompt=consent` is set (already configured)
- Try disconnecting and reconnecting

## Security Notes

### Token Storage

- **Current Implementation**: Tokens are stored in Firestore as plain text
- **Production Recommendation**: Encrypt tokens before storing using Firebase Cloud Functions
- **Best Practice**: Use a server-side token exchange instead of client-side

### Implementing Server-Side Token Exchange (Recommended for Production)

Create a Firebase Cloud Function to handle token exchange:

```javascript
// functions/index.js
const functions = require('firebase-functions');
const { OAuth2Client } = require('google-auth-library');

exports.exchangeOAuthCode = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { code } = data;
  const oauth2Client = new OAuth2Client(
    functions.config().google.client_id,
    functions.config().google.client_secret, // Secret only on server!
    functions.config().google.redirect_uri
  );

  const { tokens } = await oauth2Client.getToken(code);

  // Encrypt tokens here before returning
  return { tokens };
});
```

Then update `googleOAuthService.ts` to call this function instead of direct token exchange.

## Publishing Your App

To move from testing to production:

1. Go to **OAuth consent screen** in Google Cloud Console
2. Click **Publish App**
3. Submit for verification if you want the "unverified app" warning removed
4. Update your `.env.local` redirect URI to production domain
5. Deploy your app

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify all Google Cloud Console configurations
3. Ensure environment variables are set correctly
4. Test with a fresh Google account

---

## Next Steps

- Implement server-side token exchange for production
- Add token encryption for enhanced security
- Set up monitoring for OAuth failures
- Add email notifications when connection expires
