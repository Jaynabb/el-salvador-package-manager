# How to Get Your Firebase Service Account Key

You need the Firebase Service Account Key to run the tester creation scripts. Here's how to get it:

## Steps

### 1. Go to Firebase Console
Visit: https://console.firebase.google.com/project/el-salvador-package-manager/settings/serviceaccounts/adminsdk

### 2. Generate New Private Key

1. Click on the **"Service accounts"** tab
2. Scroll down to **"Firebase Admin SDK"**
3. Click **"Generate new private key"**
4. Click **"Generate key"** in the confirmation dialog

### 3. Save the File

1. A JSON file will be downloaded (e.g., `el-salvador-package-manager-firebase-adminsdk-xxxxx.json`)
2. **Rename it to**: `serviceAccountKey.json`
3. **Move it to** the project root folder: `C:\Users\jmcna\Downloads\el-salvador-package-manager\`

## Security Warning

⚠️ **IMPORTANT**: This file contains sensitive credentials!

- **DO NOT** commit it to git (it's already in `.gitignore`)
- **DO NOT** share it publicly
- **DO NOT** upload it anywhere
- Keep it secure on your local machine only

## Verify Setup

After downloading and renaming the file, verify it's in the right place:

```bash
cd C:\Users\jmcna\Downloads\el-salvador-package-manager
ls serviceAccountKey.json
```

You should see the file listed.

## Now You Can Create Testers

Once the service account key is in place, you can use the tester scripts:

```bash
# List organizations
node list-organizations.js

# Create a tester
node create-tester.js tester@example.com "Tester Name" password123 organizationId
```

See `TESTER_GUIDE.md` for full instructions on creating testers.
