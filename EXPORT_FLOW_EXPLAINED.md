# Export Flow - How Documents Get to Google Drive

## ✅ YES - All Member Exports Go to Organization Owner's Drive

Here's exactly how it works:

## Step-by-Step Flow

### 1. Google Account Connection (One-Time Setup)
```
Organization Owner logs in
  ↓
Goes to Settings → Google Integration
  ↓
Clicks "Connect Google Account"
  ↓
Signs in with: owner@business.com
  ↓
Google tokens saved to Organization document:
{
  organizationId: "org123",
  googleConnected: true,
  googleAccessToken: "...",
  googleRefreshToken: "...",
  googleEmail: "owner@business.com",  // ← WHOSE Drive
  googleDriveFolderId: "abc123"        // ← Auto-created folder
}
```

**Result**: Folder created in owner@business.com's Google Drive:
- Path: `Google Drive → ImportFlow - Exported Orders`
- This folder will contain ALL exported documents

---

### 2. Member Exports Order (Daily Usage)
```
Organization Member (employee@business.com) logs in
  ↓
Uploads screenshots → creates orders
  ↓
Selects orders in Order Management
  ↓
Clicks "Export Selected"
  ↓
Code: orderExportService.ts (Line 394)
  ↓
Gets organizationId from currentUser
  ↓
Fetches Organization document
  ↓
Uses Organization's googleAccessToken  // ← Owner's token!
  ↓
Uses Organization's googleDriveFolderId // ← Owner's folder!
  ↓
Creates Google Doc in owner@business.com's Drive
  ↓
Document appears in: owner@business.com → ImportFlow folder
```

**Result**: Document created in **owner's Drive**, NOT member's Drive!

---

### 3. Code Verification

From `orderExportService.ts:394-413`:
```typescript
export const exportOrdersToGoogleDocs = async (
  orders: OrderRow[],
  organizationId: string  // ← Uses org ID, not user ID!
): Promise<...> => {

  // Get organization's access token (line 404)
  const accessToken = await getValidAccessToken(organizationId);

  // Get organization's folder ID (line 407-410)
  const orgRef = doc(db, 'organizations', organizationId);
  const orgSnap = await getDoc(orgRef);
  const org = orgSnap.data() as Organization;
  const folderId = org.googleDriveFolderId; // ← Owner's folder

  // Create doc using owner's credentials
  const { docId, isNew } = await createOrAppendOrderDocument(
    orders,
    accessToken,    // ← Owner's token
    organizationId,
    folderId        // ← Owner's folder
  );
}
```

**Key Point**: The code NEVER uses the current user's Google credentials. It ALWAYS uses the organization's credentials (which belong to whoever connected Google - typically the owner).

---

## What Gets Exported

### Document Format (from `orderExportService.ts:265-389`)

For each order:
```
[Customer Name] ← Bold
Paquete #123
USPS #4567
VALOR: $156.34
[Screenshot 1] [Screenshot 2] [Screenshot 3]

[Next customer...]
```

### Screenshots Included
- All screenshots uploaded by ANY member
- Screenshots from Firebase Storage (uploaded via `BulkScreenshotUpload.tsx:95-113`)
- Image size: 180x135 PT (2.5" x 1.875")
- Multiple screenshots per order displayed inline

---

## Folder Structure in Owner's Google Drive

```
Google Drive (owner@business.com)
├── My Drive
├── Shared with me
└── ImportFlow - Exported Orders/  ← Auto-created
    ├── Orders Export - 2024-12-05
    ├── Orders Export - 2024-12-06
    └── Orders Export - 2024-12-07
```

---

## Key Points

### ✅ Confirmed Behavior:
1. **ONE Google connection per organization** (not per user)
2. **All exports go to whoever connected Google** (usually owner)
3. **All members share the same Google Drive folder**
4. **Screenshots ARE included in exports** (inline images in Google Doc)
5. **Owner can see ALL documents from ALL members**

### 🔍 How It Works:
- Member uploads screenshot → Saved to Firebase Storage → URL stored in order
- Member exports order → Code uses org's Google token → Creates doc in org's Drive
- Document includes screenshot URLs embedded as images
- Owner sees all docs in their "ImportFlow - Exported Orders" folder

### 📊 For Master Admin:
You need to:
1. Query all organizations
2. For each organization, get their orders with screenshots
3. Display order details + screenshot URLs
4. Provide download links to Google Docs (stored in org's Drive)

---

## Security & Access

### Who Can Access What:

| User Type | Can See Documents | Can Download Screenshots |
|-----------|------------------|-------------------------|
| Organization Owner | ✅ All docs in their Drive | ✅ All org screenshots |
| Organization Member | ✅ All docs (shared Drive) | ✅ All org screenshots |
| Master Admin | ❌ Not in their Drive | ✅ Via Firestore URLs |

**Master Admin Access**:
- Master admin does NOT have direct Google Drive access
- But can access screenshot URLs from Firebase Storage
- Can view all orders and screenshots via Firestore
- Needs dashboard to search/retrieve documents

---

## Answering Your Questions

### Q1: Do all member docs get exported to organization owner's drive?
**✅ YES** - All exports from any member go to the organization's connected Google Drive (whoever connected it, usually the owner).

### Q2: Can master admin see screenshots?
**✅ YES** - Screenshots are stored in Firebase Storage with public URLs. Master admin can query Firestore and access all screenshot URLs.

### Q3: Can master admin download exported Google Docs?
**⚠️ NOT YET** - Currently Google Docs are in owner's Drive. Master admin needs:
1. List of all exported doc IDs (stored where?)
2. Download links or direct access
3. OR: Service account with domain-wide delegation

**Solution Options**:
1. **Store doc URLs in Firestore** when exporting (recommended)
2. **Use Google Service Account** with domain-wide delegation
3. **Owner shares folder** with master admin email

---

## Next Steps for Master Admin Dashboard

### Required Features:
1. **Organization Overview**: List all orgs with stats
2. **Document Search**: Search by customer name, date, org
3. **Screenshot Viewer**: Display all screenshots for an order
4. **Download Links**: Link to Google Docs in owner's Drive
5. **Export History**: Track all exports with timestamps

### Implementation Plan:
1. Add `exportedDocs` collection to Firestore
2. When exporting, save doc metadata:
   ```typescript
   {
     docId: "abc123",
     docUrl: "https://docs.google.com/...",
     organizationId: "org123",
     customerNames: ["Maria", "Jose"],
     screenshotUrls: ["url1", "url2"],
     exportedAt: Date,
     exportedBy: "userId"
   }
   ```
3. Master admin queries this collection
4. Displays searchable table with download links

Should I implement this now?
