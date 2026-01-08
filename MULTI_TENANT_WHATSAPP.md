# Multi-Tenant WhatsApp with One Twilio Number

## 🎯 The Challenge

**Scenario:**
- You have ONE Twilio WhatsApp number: `+1 (415) 555-0123`
- You have MULTIPLE importers using your system
- Each importer needs their data kept separate
- All importers send messages to the SAME Twilio number

**How do we know which importer sent which message?**

---

## ✅ Solution: Phone Number Registration

### **Concept:**

1. **Importers register their phone number** in the web app
2. **System creates mapping:** `phoneNumber → importerId`
3. **When WhatsApp message arrives**, look up sender's phone
4. **Route to correct importer's batch**

### **Database Structure:**

```
/importers
  ├─ imp-001
  │   ├─ businessName: "Import Express SV"
  │   ├─ phone: "+503 7777-8888"  ← Registered phone
  │   ├─ email: "..."
  │   └─ ...
  │
  └─ imp-002
      ├─ businessName: "Quick Import Co"
      ├─ phone: "+503 6666-5555"  ← Different phone
      └─ ...

/batches
  ├─ batch-abc
  │   ├─ importerId: "imp-001"  ← Belongs to first importer
  │   ├─ customerName: "Maria Rodriguez"
  │   └─ ...
  │
  └─ batch-xyz
      ├─ importerId: "imp-002"  ← Belongs to second importer
      ├─ customerName: "Juan Perez"
      └─ ...
```

---

## 📋 Implementation

### **Step 1: Importer Registration (Web App)**

```typescript
// src/components/ImporterSettings.tsx

export default function ImporterSettings() {
  const [phone, setPhone] = useState('');
  const {currentUser} = useAuth();

  const registerPhone = async () => {
    // Validate phone format
    if (!phone.startsWith('+503')) {
      alert('Please enter valid El Salvador phone (+503 XXXX-XXXX)');
      return;
    }

    // Check if phone already registered
    const existing = await db.collection('importers')
      .where('phone', '==', phone)
      .get();

    if (!existing.empty && existing.docs[0].id !== currentUser.importerId) {
      alert('This phone number is already registered to another importer');
      return;
    }

    // Register phone
    await updateDoc(doc(db, 'importers', currentUser.importerId), {
      phone: phone,
      phoneRegisteredAt: new Date(),
      updatedAt: new Date()
    });

    alert('✅ Phone number registered! You can now send WhatsApp messages.');
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">WhatsApp Integration</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Your WhatsApp Number
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+503 7777-8888"
          className="w-full px-4 py-2 border rounded-lg"
        />
        <p className="text-sm text-gray-600 mt-1">
          This number will be used to identify your messages
        </p>
      </div>

      <button
        onClick={registerPhone}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Register Phone Number
      </button>

      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">📱 How to use:</h3>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          <li>Save this number in WhatsApp: <strong>+1 (415) 555-0123</strong></li>
          <li>Send customer name as text message</li>
          <li>Send order screenshots</li>
          <li>Check web app to process batch</li>
        </ol>
      </div>
    </div>
  );
}
```

### **Step 2: Cloud Function Webhook (Routes by Phone)**

```typescript
// functions/src/index.ts

import {onRequest} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import twilio from "twilio";

const db = getFirestore();

export const whatsappWebhook = onRequest(async (req, res) => {
  const {From, Body, NumMedia, MediaUrl0, MediaContentType0} = req.body;

  try {
    // 1. IDENTIFY IMPORTER by phone number
    const senderPhone = From.replace('whatsapp:', '');
    const importer = await findImporterByPhone(senderPhone);

    if (!importer) {
      // Phone not registered!
      await sendWhatsAppReply(From,
        `⚠️ Phone number not registered.\n\n` +
        `Please register your phone number in the web app first.\n\n` +
        `Settings → WhatsApp Integration`
      );
      return res.status(200).send('OK');
    }

    console.log(`Message from importer: ${importer.businessName} (${importer.id})`);

    // 2. GET OR CREATE ACTIVE BATCH for this importer
    let batch = await getActiveBatch(importer.id);

    if (!batch) {
      batch = await createBatch(importer.id);
      console.log(`Created new batch for ${importer.businessName}`);
    }

    // 3. HANDLE TEXT MESSAGE (customer name)
    if (Body && NumMedia === '0') {
      await updateBatch(batch.id, {
        customerName: Body.trim(),
        updatedAt: new Date()
      });

      await sendWhatsAppReply(From,
        `✅ Customer name: ${Body}\n\n` +
        `Send screenshots now.`
      );
      return res.status(200).send('OK');
    }

    // 4. HANDLE IMAGE MESSAGE
    if (NumMedia && parseInt(NumMedia) > 0) {
      // Download image
      const imageResponse = await fetch(MediaUrl0);
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(imageBuffer).toString('base64');

      // Save screenshot with importer context
      const screenshotRef = await db.collection('screenshots').add({
        batchId: batch.id,
        importerId: importer.id,  // ← Track which importer
        source: 'whatsapp',
        imageBase64: base64,
        imageType: MediaContentType0,
        extractionStatus: 'pending',
        uploadedAt: new Date()
      });

      // Update batch
      await db.collection('batches').doc(batch.id).update({
        screenshotIds: [...batch.screenshotIds, screenshotRef.id],
        screenshotCount: batch.screenshotCount + 1,
        hasWhatsAppScreenshots: true,
        updatedAt: new Date()
      });

      // Extract data async
      processScreenshotAsync(screenshotRef.id, base64);

      await sendWhatsAppReply(From,
        `✅ Screenshot ${batch.screenshotCount + 1} received!\n\n` +
        `Batch: ${batch.customerName || 'No name yet'}\n` +
        `Total screenshots: ${batch.screenshotCount + 1}`
      );
      return res.status(200).send('OK');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});

/**
 * CRITICAL: Find importer by registered phone number
 */
async function findImporterByPhone(phone: string): Promise<any> {
  const snapshot = await db.collection('importers')
    .where('phone', '==', phone)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

/**
 * Get active batch for specific importer
 */
async function getActiveBatch(importerId: string): Promise<any> {
  const snapshot = await db.collection('batches')
    .where('importerId', '==', importerId)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

/**
 * Create new batch for specific importer
 */
async function createBatch(importerId: string): Promise<any> {
  const batchRef = await db.collection('batches').add({
    importerId: importerId,  // ← Scoped to importer
    customerName: null,
    screenshotIds: [],
    screenshotCount: 0,
    status: 'active',
    hasWhatsAppScreenshots: false,
    hasManualScreenshots: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return {
    id: batchRef.id,
    importerId,
    screenshotIds: [],
    screenshotCount: 0,
    status: 'active',
    hasWhatsAppScreenshots: false,
    hasManualScreenshots: false
  };
}

async function updateBatch(batchId: string, updates: any) {
  await db.collection('batches').doc(batchId).update(updates);
}

async function sendWhatsAppReply(to: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = twilio(accountSid, authToken);

  await client.messages.create({
    from: 'whatsapp:+14155238886', // Your ONE Twilio number
    to: to,
    body: message
  });
}
```

---

## 🔐 Data Isolation

### **Firestore Security Rules:**

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Importers can only read their own data
    match /importers/{importerId} {
      allow read: if request.auth != null &&
                     request.auth.token.importerId == importerId;
      allow update: if request.auth != null &&
                       request.auth.token.importerId == importerId;
    }

    // Batches scoped to importer
    match /batches/{batchId} {
      allow read, write: if request.auth != null &&
                           resource.data.importerId == request.auth.token.importerId;
    }

    // Screenshots scoped to importer
    match /screenshots/{screenshotId} {
      allow read, write: if request.auth != null &&
                           resource.data.importerId == request.auth.token.importerId;
    }

    // Packages scoped to importer
    match /packages/{packageId} {
      allow read, write: if request.auth != null &&
                           resource.data.importerId == request.auth.token.importerId;
    }

    // Customers scoped to importer
    match /customers/{customerId} {
      allow read, write: if request.auth != null &&
                           resource.data.importerId == request.auth.token.importerId;
    }
  }
}
```

### **Frontend Queries (Auto-filter by Importer):**

```typescript
// src/components/BatchManager.tsx

const loadActiveBatch = async () => {
  const {currentUser} = useAuth();

  // Query automatically scoped to current importer
  const batchesRef = collection(db, 'batches');
  const q = query(
    batchesRef,
    where('importerId', '==', currentUser.importerId), // ← Filter
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  // Returns only this importer's batches
};
```

---

## 📊 Example Flow

### **Scenario: Two Importers Using Same Twilio Number**

**Setup:**
```
Twilio Number: +1 (415) 555-0123 (shared)

Importer A: Import Express SV
  Phone: +503 7777-8888
  ID: imp-001

Importer B: Quick Import Co
  Phone: +503 6666-5555
  ID: imp-002
```

### **Flow:**

**1. Importer A sends message:**
```
From: +503 7777-8888
To: +1 (415) 555-0123
Message: "Maria Rodriguez"
```

**Webhook receives:**
```typescript
findImporterByPhone('+503 7777-8888')
→ Returns: imp-001 (Import Express SV)

getActiveBatch('imp-001')
→ Returns: batch-abc (Importer A's batch)

updateBatch('batch-abc', {customerName: 'Maria Rodriguez'})
```

**2. Importer B sends message (at the same time!):**
```
From: +503 6666-5555
To: +1 (415) 555-0123
Message: "Juan Perez"
```

**Webhook receives:**
```typescript
findImporterByPhone('+503 6666-5555')
→ Returns: imp-002 (Quick Import Co)

getActiveBatch('imp-002')
→ Returns: batch-xyz (Importer B's batch)

updateBatch('batch-xyz', {customerName: 'Juan Perez'})
```

**Result:**
- ✅ Data kept separate
- ✅ Each importer has their own batch
- ✅ No data mixing
- ✅ Same Twilio number works for both

---

## 🎯 Authentication Integration

### **Frontend: Auth Context**

```typescript
// src/contexts/AuthContext.tsx

interface AuthContextType {
  currentUser: {
    uid: string;
    email: string;
    displayName: string;
    role: 'master-admin' | 'importer-admin' | 'importer-user';
    importerId: string;  // ← Critical for multi-tenant
    importerName: string;
  } | null;
}

export function AuthProvider({children}) {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Get user metadata from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();

        // Get importer details
        const importerDoc = await getDoc(doc(db, 'importers', userData.importerId));
        const importerData = importerDoc.data();

        setCurrentUser({
          uid: user.uid,
          email: user.email,
          displayName: userData.displayName,
          role: userData.role,
          importerId: userData.importerId,
          importerName: importerData.businessName
        });
      } else {
        setCurrentUser(null);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{currentUser}}>
      {children}
    </AuthContext.Provider>
  );
}
```

### **Usage in Components:**

```typescript
// src/components/BatchManager.tsx

export default function BatchManager() {
  const {currentUser} = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadBatches(currentUser.importerId);
    }
  }, [currentUser]);

  const loadBatches = async (importerId: string) => {
    // All queries scoped to this importer
    const q = query(
      collection(db, 'batches'),
      where('importerId', '==', importerId),
      where('status', '==', 'active')
    );

    const snapshot = await getDocs(q);
    // Returns only this importer's data
  };
}
```

---

## 🚨 Edge Cases & Solutions

### **Case 1: Importer Changes Phone Number**

**Problem:** Phone number registered changes

**Solution:**
```typescript
// Allow phone number update
async function updateImporterPhone(importerId: string, newPhone: string) {
  // Check new phone not already registered
  const existing = await db.collection('importers')
    .where('phone', '==', newPhone)
    .get();

  if (!existing.empty && existing.docs[0].id !== importerId) {
    throw new Error('Phone already registered');
  }

  // Update
  await db.collection('importers').doc(importerId).update({
    phone: newPhone,
    phoneUpdatedAt: new Date()
  });
}
```

### **Case 2: Two Importers Same Customer**

**Problem:** Two importers both have customer named "Maria Rodriguez"

**Solution:** Data is already separate by `importerId`
```
Importer A:
  /customers/cust-001
    ├─ name: "Maria Rodriguez"
    ├─ phone: "+503 1111-1111"
    └─ importerId: "imp-001"  ← Separate

Importer B:
  /customers/cust-002
    ├─ name: "Maria Rodriguez"
    ├─ phone: "+503 1111-1111"  ← Same phone!
    └─ importerId: "imp-002"  ← Different importer

Both are separate customers!
```

### **Case 3: Unregistered Phone Sends Message**

**Problem:** Someone sends message from unregistered phone

**Solution:** Already handled in webhook:
```typescript
if (!importer) {
  await sendWhatsAppReply(From,
    `⚠️ Phone not registered. Please register in web app.`
  );
  return;
}
```

### **Case 4: Multiple Users Same Importer**

**Problem:** Importer has multiple staff members

**Solution:**
- Register ONE phone per importer (business WhatsApp number)
- Multiple users can access web app
- All see same batches (filtered by importerId)

**OR** register multiple phones:
```
/importers/imp-001
  ├─ primaryPhone: "+503 7777-8888"
  └─ additionalPhones: ["+503 7777-9999", "+503 7777-0000"]

// Update findImporterByPhone:
async function findImporterByPhone(phone: string) {
  const snapshot = await db.collection('importers')
    .where('primaryPhone', '==', phone)
    .get();

  if (!snapshot.empty) return snapshot.docs[0];

  // Check additional phones
  const snapshot2 = await db.collection('importers')
    .where('additionalPhones', 'array-contains', phone)
    .get();

  if (!snapshot2.empty) return snapshot2.docs[0];

  return null;
}
```

---

## 📋 Setup Checklist

### **One-Time Setup:**

- [ ] Get ONE Twilio WhatsApp number
- [ ] Deploy Cloud Function with multi-tenant logic
- [ ] Set up Firestore security rules
- [ ] Add importer phone registration to web app
- [ ] Test with multiple test phone numbers

### **Per Importer:**

- [ ] Create importer account in web app
- [ ] Importer registers their phone number
- [ ] Importer saves Twilio number in WhatsApp
- [ ] Test: Send message from importer's phone
- [ ] Verify: Message routes to correct importer

---

## 🎯 Complete Example

### **Importer Onboarding:**

```typescript
// Admin creates new importer
const importerRef = await db.collection('importers').add({
  businessName: "Import Express SV",
  contactName: "Carlos Hernandez",
  email: "carlos@importexpress.sv",
  phone: null,  // ← Will be registered by importer
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date()
});

// Create admin user for this importer
await db.collection('users').doc(userUid).set({
  email: "carlos@importexpress.sv",
  displayName: "Carlos Hernandez",
  role: 'importer-admin',
  importerId: importerRef.id,  // ← Links user to importer
  status: 'active',
  createdAt: new Date()
});
```

### **Importer Registers Phone:**

```typescript
// Importer logs into web app
// Goes to Settings → WhatsApp Integration
// Enters: +503 7777-8888
// Clicks "Register"

await updateDoc(doc(db, 'importers', currentUser.importerId), {
  phone: '+503 7777-8888',
  phoneRegisteredAt: new Date()
});
```

### **Importer Sends WhatsApp:**

```
WhatsApp: +503 7777-8888 → +1 (415) 555-0123
Message: "Maria Rodriguez"

Webhook:
  → findImporterByPhone('+503 7777-8888')
  → Returns: imp-001
  → Creates batch for imp-001
  → Saves customer name
```

### **Data Remains Separate:**

```
Firestore:
  /batches/batch-abc
    ├─ importerId: "imp-001"  ← Scoped to this importer
    ├─ customerName: "Maria Rodriguez"
    └─ ...

  /batches/batch-xyz
    ├─ importerId: "imp-002"  ← Different importer
    ├─ customerName: "Juan Perez"
    └─ ...

Security rules ensure imp-001 can't see batch-xyz!
```

---

## ✅ Summary

**One Twilio Number, Multiple Importers:**

1. ✅ **Importers register phone** in web app
2. ✅ **System maps phone → importerId**
3. ✅ **Webhook routes messages** to correct importer
4. ✅ **All data scoped** by importerId
5. ✅ **Security rules enforce** data isolation
6. ✅ **Complete separation** guaranteed

**No data mixing, ever!** 🔒

---

**Deploy this and you can support unlimited importers with ONE Twilio number!** 🚀
