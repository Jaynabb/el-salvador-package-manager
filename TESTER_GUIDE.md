# Adding Testers to ImportFlow

This guide explains how to add testers to the ImportFlow application.

## Prerequisites

1. You must have `serviceAccountKey.json` in the project root
2. Node.js must be installed
3. You must be a master admin

## Step 1: Find Organization IDs (Optional)

If you want to add a tester to a specific organization, first find the organization ID:

```bash
node list-organizations.js
```

This will display all organizations with their IDs, names, and details.

**Example Output:**
```
🏢 Organization: TastyBuilds
   ID: Qf5pmord7LbwQSFK3cYv
   Status: active
   Subscription: active
   Members: 2
   Google Connected: ✓
   Contact: owner@tastybuilds.com
```

## Step 2: Create a Tester Account

### Basic Usage (Member of an organization)

```bash
node create-tester.js <email> "<name>" <password> <organizationId>
```

**Example:**
```bash
node create-tester.js john@test.com "John Doe" testpass123 Qf5pmord7LbwQSFK3cYv
```

This creates:
- ✅ Firebase Auth account
- ✅ User document in Firestore
- ✅ Adds them to the specified organization as a **member**
- ✅ Sets status to "active"
- ✅ No password change required on first login

### Create Organization Owner

```bash
node create-tester.js <email> "<name>" <password> <organizationId> organization-owner
```

**Example:**
```bash
node create-tester.js owner@test.com "Test Owner" testpass123 Qf5pmord7LbwQSFK3cYv organization-owner
```

### Create Master Admin (No organization)

```bash
node create-tester.js <email> "<name>" <password> null master-admin
```

**Example:**
```bash
node create-tester.js admin@test.com "Test Admin" testpass123 null master-admin
```

## Step 3: Share Credentials with Tester

After running the script, you'll see:

```
✅ Tester account created successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 LOGIN CREDENTIALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: john@test.com
Password: testpass123
App URL: https://importflow-app.web.app
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Send these credentials to your tester via email or secure message.

## Google Cloud Console - Testing List

When you add someone's email to the **Google Cloud OAuth testing list**:

1. **Purpose**: Allows them to use Google OAuth features (Google Drive connection)
2. **Does NOT create an account**: You still need to use the scripts above
3. **Steps**:
   - Add their email to testing list in Google Cloud Console
   - Create their account using `create-tester.js`
   - They log in with the email/password you provide
   - If they're an org owner, they can then connect Google Drive

## Roles Explained

### organization-member
- Can view dashboard and orders
- Can upload screenshots
- Can export to Google Docs (using owner's connected Google Drive)
- **CANNOT** manage organization settings
- **CANNOT** add/remove other members
- **CANNOT** connect Google Drive

### organization-owner
- Everything a member can do, PLUS:
- Can manage organization settings
- Can add/remove members
- Can connect Google Drive
- Can disconnect Google Drive
- Can view organization member list

### master-admin
- Can view all organizations
- Can create new organizations
- Can view all export history
- Can search across all data
- **Does NOT** belong to any organization

## Common Issues

### "Email already exists"
The email is already registered. Options:
1. Use a different email
2. Reset password in Firebase Console
3. Delete the existing user and try again

### "Organization not found"
Double-check the organization ID using `node list-organizations.js`

### "Password must be at least 6 characters"
Firebase requires minimum 6 characters for passwords.

## Security Notes

- ⚠️ **Never commit** `serviceAccountKey.json` to git
- 🔐 Use strong passwords for production testers
- 📧 Send credentials via secure channels (encrypted email, password manager)
- 🧹 Remove test accounts after testing is complete
- 🔄 Testers created with this script do NOT need to change password on first login (set `requirePasswordChange: false`)

## Quick Reference

```bash
# List all organizations
node list-organizations.js

# Add a member to existing organization
node create-tester.js email@test.com "Name" password123 orgId

# Add an owner to existing organization
node create-tester.js email@test.com "Name" password123 orgId organization-owner

# Add a master admin (no organization)
node create-tester.js email@test.com "Name" password123 null master-admin
```

## App URLs

- **Production**: https://importflow-app.web.app
- **Firebase Console**: https://console.firebase.google.com/project/el-salvador-package-manager
- **Google Cloud Console**: https://console.cloud.google.com/apis/credentials?project=importflow
