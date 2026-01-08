# ImportFlow Setup Guide

Complete setup instructions for the El Salvador Package Import Manager.

## Prerequisites

- Node.js 18+ installed
- Firebase project created
- Firebase Authentication enabled
- Firebase Firestore enabled

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Firebase

1. Create a `.env.local` file in the project root (already exists)
2. Ensure it contains your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Step 3: Deploy Firestore Security Rules

1. Install Firebase CLI if you haven't already:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in your project (if not already done):
   ```bash
   firebase init firestore
   ```
   - Select your Firebase project
   - Accept the default `firestore.rules` file (we already created it)
   - Accept the default `firestore.indexes.json`

4. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

The security rules ensure:
- Master admins can access all data
- Importer admins can only access their importer's data
- Importer users have read-only access to their importer's data
- Proper data isolation between importers

## Step 4: Create Master Admin Account

Run the setup script to create your master admin account:

```bash
npm run setup-admin
```

You'll be prompted to enter:
- Admin email
- Admin password (minimum 6 characters)
- Admin display name

This creates a master admin account that has full access to the system.

## Step 5: Start the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port).

## Step 6: Log In

1. Open the app in your browser
2. Use the master admin credentials you created in Step 4
3. You should see the Admin panel available in the navigation

## Step 7: Set Up Your First Importer

1. Click on the "Admin" tab
2. Go to the "Importers" section
3. Click "Add New Importer"
4. Fill in the importer details:
   - Business Name
   - Contact Name
   - Email
   - Phone
   - Address (optional)
   - Google Sheets Webhook URL (optional, see below)
   - Notes (optional)

## Step 8: Create Users for the Importer

1. In the Admin panel, switch to the "Users" tab
2. Click "Add New User"
3. Fill in the user details:
   - Email
   - Password
   - Display Name
   - Role (Importer Admin or Importer User)
   - Assign to Importer (select the importer you created)

**Role Differences:**
- **Master Admin**: Full access to all importers and all features
- **Importer Admin**: Can manage packages and customers for their assigned importer
- **Importer User**: Read-only access to their assigned importer's data

## Optional: Google Sheets Integration

Each importer can have their own Google Sheet for package tracking.

1. Create a Google Sheet for the importer
2. Open Google Apps Script (Extensions > Apps Script)
3. Copy the code from `GoogleAppsScript.js` in this project
4. Deploy as a web app
5. Copy the webhook URL
6. Add the webhook URL to the importer's settings in the Admin panel

Now packages for that importer will automatically sync to their Google Sheet!

## Architecture Overview

### Multi-Tenant Design

- **Master Admin**: You (the service provider)
  - Can see all importers
  - Can create/manage importer accounts
  - Can create users for each importer
  - Full access to all data

- **Importer** (Your Customers):
  - Each importer is a separate business/organization
  - Has their own admin users and regular users
  - Can only see their own packages and customers
  - Data is completely isolated from other importers

- **Data Isolation**:
  - Every package and customer record has an `importerId` field
  - Firestore security rules enforce strict access control
  - Users can only access data for their assigned importer

### User Roles

1. **Master Admin**
   - Manages multiple importer businesses
   - Creates importer accounts
   - Creates users for each importer
   - Views all data across all importers

2. **Importer Admin**
   - Manages their organization's users
   - Can add/edit/delete packages
   - Can add/edit customers
   - Scoped to their importer only

3. **Importer User**
   - Read-only access to packages
   - Read-only access to customers
   - Scoped to their importer only

## Security Notes

1. **Firestore Security Rules**: Deployed rules ensure data isolation
2. **Authentication Required**: All routes require authentication
3. **Role-Based Access**: UI and API enforce role-based permissions
4. **Active User Check**: Only active users can access the system

## Production Deployment

1. Build the app:
   ```bash
   npm run build
   ```

2. Deploy to your hosting platform (Firebase Hosting, Vercel, Netlify, etc.)

3. Update Firestore security rules in production:
   ```bash
   firebase deploy --only firestore:rules --project production
   ```

4. Ensure `.env.local` is not committed to version control (it's in .gitignore)

5. Set environment variables in your hosting platform

## Troubleshooting

### "Permission Denied" Errors
- Ensure Firestore security rules are deployed
- Verify the user is assigned to an importer (if not master admin)
- Check that the user's status is "active"

### Can't Create Users
- Only master admins can create users
- Ensure you're logged in as a master admin

### Google Sheets Not Syncing
- Verify the webhook URL is correct
- Check that the Apps Script is deployed as a web app
- Note: Doesn't work from localhost (CORS), test in production

### Login Issues
- Clear browser cache and cookies
- Verify Firebase Authentication is enabled
- Check console for specific error messages

## Support

For issues or questions, please check the browser console for error messages and verify all setup steps have been completed.
