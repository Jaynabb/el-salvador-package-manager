# Master Admin Dashboard - Troubleshooting Guide

## Issue: "Failed to load dashboard data"

### Possible Causes and Solutions:

### 1. Missing Firestore Index (Most Likely)
**Symptom**: Error message about missing index or query not supported

**Solution**:
```bash
# Deploy Firestore indexes
firebase deploy --only firestore:indexes
```

**What this does**: Creates an index for the `exportHistory` collection sorted by `exportedAt` field

**Time**: Index creation can take 5-10 minutes for large datasets

---

### 2. No Export History Yet
**Symptom**: Dashboard loads but "Export History" tab is empty

**Solution**: This is NORMAL if no one has exported orders yet
- Have an organization member export some orders first
- Export tracking will start working automatically
- Dashboard will show "0 exports" until first export is made

---

### 3. Firestore Security Rules Not Set
**Symptom**: Permission denied errors in browser console

**Solution**: Update `firestore.rules` with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Allow authenticated users to read/write their own user doc
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null &&
                    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master-admin';
    }

    // Organizations - readable by members
    match /organizations/{orgId} {
      allow read: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.organizationId == orgId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master-admin'
      );
      allow write: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master-admin'
      );

      // Orders subcollection
      match /orders/{orderId} {
        allow read, write: if request.auth != null && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.organizationId == orgId ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master-admin'
        );
      }
    }

    // Export History - Master Admin can read, anyone can create
    match /exportHistory/{docId} {
      allow read: if request.auth != null &&
                    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master-admin';
      allow create: if request.auth != null;
    }

    // Organization Invites
    match /organizationInvites/{inviteId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null;
    }
  }
}
```

**Deploy rules**:
```bash
firebase deploy --only firestore:rules
```

---

### 4. Master Admin Role Not Set Correctly
**Symptom**: Dashboard doesn't load or shows "Access Denied"

**Check your role**:
1. Open browser console (F12)
2. Look for "User authenticated" log message
3. Check role field

**Fix**:
```bash
# Run the admin creation script
node create-admin-auto.js
```

Or manually in Firebase Console:
1. Go to Firestore
2. Find `users/{yourUserId}`
3. Edit document
4. Set `role` to `master-admin`

---

### 5. No Organizations in Database
**Symptom**: Dashboard loads but shows "0 organizations"

**Solution**: Create test organization
1. Log in as organization owner (not master admin)
2. Complete organization setup
3. Switch back to master admin account
4. Refresh dashboard

---

### 6. Database Connection Issue
**Symptom**: Generic "Failed to load" error

**Check**:
1. Open browser console (F12)
2. Look for specific error messages
3. Check Network tab for failed requests

**Common fixes**:
- Clear browser cache and reload
- Check Firebase configuration in `.env`
- Verify Firebase project is accessible
- Check internet connection

---

## How to Test If It's Working

### Step 1: Check Browser Console
```javascript
// Open browser console (F12)
// You should see these logs:
"📦 App component rendering..."
"✅ User authenticated, rendering dashboard for: your@email.com"
"Loading dashboard..."
```

### Step 2: Create Test Data
```bash
# 1. Create an organization (as org owner)
# 2. Upload some screenshots
# 3. Export orders
# 4. Switch to master admin
# 5. Refresh dashboard
```

### Step 3: Verify Each Tab
- **Organizations Tab**: Should show at least 1 organization
- **Export History Tab**: Should show recent exports (if any exist)
- **Document Search Tab**: Should allow typing and searching

---

## Expected Behavior

### On Fresh Install (No Data Yet):
```
Platform Overview:
- Organizations: 0
- Total Users: 1 (just you)
- Total Orders: 0
- Total Exports: 0
- Total Value: $0

Organizations Tab: "No organizations found"
Export History Tab: Empty (no exports yet)
Document Search Tab: Ready to search (but no results)
```

### After Creating Orgs and Exports:
```
Platform Overview:
- Organizations: 2
- Total Users: 5
- Total Orders: 10
- Total Exports: 3
- Total Value: $1,234.56

Organizations Tab: Shows list of orgs with stats
Export History Tab: Shows recent exports
Document Search Tab: Can find documents by customer name
```

---

## Debug Commands

### Check Firestore Collections:
```bash
# Install Firebase CLI (if not already)
npm install -g firebase-tools

# Login
firebase login

# List Firestore collections (manual inspection)
# Go to Firebase Console → Firestore Database
```

### Check User Role:
```javascript
// In browser console on the app:
console.log(window.localStorage);
// Look for Firebase auth data
```

### Test Firestore Query Manually:
```javascript
// In browser console:
import { collection, getDocs } from 'firebase/firestore';
import { db } from './services/firebase';

// Test loading organizations
const orgsSnap = await getDocs(collection(db, 'organizations'));
console.log('Organizations:', orgsSnap.size);

// Test loading users
const usersSnap = await getDocs(collection(db, 'users'));
console.log('Users:', usersSnap.size);
```

---

## Fixes Applied

### Version 1 (December 5, 2024):
- ✅ Added try-catch for exportHistory query
- ✅ Gracefully handles missing export history collection
- ✅ Improved error messages
- ✅ Fixed OrderRow type import
- ✅ Added Firestore index configuration

---

## Still Having Issues?

### Get Detailed Error Info:
1. Open browser console (F12)
2. Go to Console tab
3. Look for red error messages
4. Copy the full error text

### Share This Info:
- Browser (Chrome, Firefox, Safari, etc.)
- Error message from console
- Which tab you're on (Organizations, Export History, Search)
- Screenshot of the error alert

### Quick Reset:
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Log out and log back in
4. Try in incognito/private window

---

## Performance Notes

**Dashboard Load Time**:
- 1-5 organizations: < 1 second
- 10-20 organizations: 1-3 seconds
- 50+ organizations: 5-10 seconds

**Why it might be slow**:
- Loading orders from ALL organizations
- Calculating stats for each org
- No pagination yet (loads all data at once)

**Future Optimization**:
- Add pagination for organizations
- Cache dashboard data
- Load stats on-demand (not all at once)
- Add loading indicators per section

---

## Contact Support

If issues persist after trying all troubleshooting steps:
1. Check browser console for errors
2. Verify Firestore rules are deployed
3. Ensure indexes are created
4. Test with fresh user account
5. Try different browser

**Most Common Fix**: Deploy Firestore indexes
```bash
firebase deploy --only firestore:indexes
```

Wait 5-10 minutes, then refresh the page.
