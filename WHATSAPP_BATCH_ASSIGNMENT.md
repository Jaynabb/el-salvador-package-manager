# WhatsApp Batch Assignment System

## Overview

Importers can now **choose which batch** incoming WhatsApp screenshots should be assigned to. This provides flexibility when handling multiple customers simultaneously.

---

## Two Ways to Assign Batches

### **Method 1: Web Interface** (WhatsApp Batch Manager)

Navigate to **📱 WhatsApp Batches** in the app:

**Features:**
- ✅ View all active batches
- ✅ Create new batches on the fly
- ✅ See incoming WhatsApp messages grouped by sender
- ✅ Assign individual messages or entire conversations to batches
- ✅ Assign all unassigned messages with one click

**Workflow:**
1. Open **WhatsApp Batches** page
2. Select or create target batch
3. Click "Assign" on incoming messages
4. Messages move to selected batch

### **Method 2: WhatsApp Commands** (Text-Based)

Send commands directly via WhatsApp text messages:

**Available Commands:**

```
BATCH: Customer Name
```
Creates or switches to batch for that customer. All subsequent screenshots go to this batch.

**Example:**
```
You → System: BATCH: Maria Rodriguez
System → You: ✓ Switched to batch: Maria Rodriguez
[Send screenshot 1]
System → You: ✓ Added to Maria Rodriguez batch
[Send screenshot 2]
System → You: ✓ Added to Maria Rodriguez batch

You → System: BATCH: Carlos Mendez
System → You: ✓ Switched to batch: Carlos Mendez
[Send screenshot 3]
System → You: ✓ Added to Carlos Mendez batch
```

**Additional Commands:**

```
LIST
```
Shows all your active batches:
```
System: Your active batches:
1. Maria Rodriguez (3 screenshots)
2. Carlos Mendez (1 screenshot)
3. Ana Martinez (5 screenshots)
```

```
STATUS
```
Shows current batch status:
```
System: Current batch: Maria Rodriguez
Screenshots: 3
Status: Active
```

```
HELP
```
Shows available commands:
```
System: Available commands:
- BATCH: [name] - Switch to batch
- LIST - Show all batches
- STATUS - Current batch info
- HELP - Show this message
```

---

## Backend Implementation

### Cloud Function: WhatsApp Webhook Handler

```typescript
// functions/src/index.ts

export const whatsappWebhook = onRequest(async (req, res) => {
  const { From, Body, NumMedia, MediaUrl0 } = req.body;

  // Get importer by phone number
  const importerPhone = From.replace('whatsapp:', '');
  const importer = await getImporterByPhone(importerPhone);

  if (!importer) {
    await sendWhatsAppReply(From, '⚠️ Phone not registered. Register in Settings first.');
    return res.status(200).send('OK');
  }

  // Handle text commands
  if (Body && NumMedia === '0') {
    const command = Body.trim().toUpperCase();

    // BATCH: Customer Name
    if (command.startsWith('BATCH:')) {
      const customerName = Body.substring(6).trim();
      const batch = await getOrCreateBatch(importer.id, customerName);

      // Set as active batch for this importer
      await setActiveBatch(importer.id, batch.id);

      await sendWhatsAppReply(From,
        `✓ Switched to batch: ${customerName}\n\n` +
        `All screenshots will now go to this batch.`
      );
      return res.status(200).send('OK');
    }

    // LIST command
    if (command === 'LIST') {
      const batches = await getActiveBatches(importer.id);

      if (batches.length === 0) {
        await sendWhatsAppReply(From, 'No active batches. Send "BATCH: Customer Name" to create one.');
      } else {
        const list = batches.map((b, i) =>
          `${i + 1}. ${b.customerName} (${b.screenshotCount} screenshots)`
        ).join('\n');

        await sendWhatsAppReply(From, `Your active batches:\n\n${list}`);
      }
      return res.status(200).send('OK');
    }

    // STATUS command
    if (command === 'STATUS') {
      const activeBatch = await getActiveBatch(importer.id);

      if (!activeBatch) {
        await sendWhatsAppReply(From,
          'No active batch.\n\n' +
          'Send "BATCH: Customer Name" to create one.'
        );
      } else {
        await sendWhatsAppReply(From,
          `Current batch: ${activeBatch.customerName}\n` +
          `Screenshots: ${activeBatch.screenshotCount}\n` +
          `Status: ${activeBatch.status}`
        );
      }
      return res.status(200).send('OK');
    }

    // HELP command
    if (command === 'HELP') {
      await sendWhatsAppReply(From,
        '📱 WhatsApp Batch Commands:\n\n' +
        'BATCH: [name] - Switch to batch\n' +
        'LIST - Show all batches\n' +
        'STATUS - Current batch info\n' +
        'HELP - Show this message\n\n' +
        'Example:\n' +
        'BATCH: Maria Rodriguez'
      );
      return res.status(200).send('OK');
    }

    // Unknown command
    await sendWhatsAppReply(From,
      `Unknown command: "${Body}"\n\n` +
      'Send "HELP" for available commands.'
    );
    return res.status(200).send('OK');
  }

  // Handle image
  if (NumMedia && parseInt(NumMedia) > 0) {
    // Get active batch
    let activeBatch = await getActiveBatch(importer.id);

    if (!activeBatch) {
      // No active batch - create default one
      activeBatch = await createBatch(importer.id, {
        customerName: `Batch ${new Date().toLocaleDateString()}`,
        status: 'active'
      });
      await setActiveBatch(importer.id, activeBatch.id);
    }

    // Download and save screenshot
    const imageBuffer = await downloadImage(MediaUrl0);
    const base64 = imageBuffer.toString('base64');

    const screenshotRef = await db.collection('screenshots').add({
      batchId: activeBatch.id,
      organizationId: importer.organizationId,
      source: 'whatsapp',
      imageBase64: base64,
      imageType: 'image/jpeg',
      extractionStatus: 'pending',
      uploadedAt: new Date()
    });

    // Update batch
    await updateBatch(activeBatch.id, {
      screenshotIds: [...activeBatch.screenshotIds, screenshotRef.id],
      screenshotCount: activeBatch.screenshotCount + 1,
      hasWhatsAppScreenshots: true,
      updatedAt: new Date()
    });

    // Trigger AI extraction
    extractDataInBackground(screenshotRef.id, base64);

    await sendWhatsAppReply(From,
      `✓ Screenshot ${activeBatch.screenshotCount + 1} added to: ${activeBatch.customerName}`
    );

    return res.status(200).send('OK');
  }

  res.status(200).send('OK');
});
```

### Helper Functions

```typescript
// Get or create batch by customer name
async function getOrCreateBatch(organizationId: string, customerName: string) {
  // Check if batch with this name exists
  const existingBatch = await db.collection('batches')
    .where('organizationId', '==', organizationId)
    .where('customerName', '==', customerName)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!existingBatch.empty) {
    return { id: existingBatch.docs[0].id, ...existingBatch.docs[0].data() };
  }

  // Create new batch
  const batchRef = await db.collection('batches').add({
    organizationId,
    customerName,
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
    organizationId,
    customerName,
    screenshotIds: [],
    screenshotCount: 0,
    status: 'active',
    hasWhatsAppScreenshots: false,
    hasManualScreenshots: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Set active batch for importer
async function setActiveBatch(organizationId: string, batchId: string) {
  await db.collection('whatsappSessions').doc(organizationId).set({
    activeBatchId: batchId,
    updatedAt: new Date()
  }, { merge: true });
}

// Get active batch
async function getActiveBatch(organizationId: string) {
  const session = await db.collection('whatsappSessions').doc(organizationId).get();

  if (!session.exists) return null;

  const batchId = session.data()?.activeBatchId;
  if (!batchId) return null;

  const batch = await db.collection('batches').doc(batchId).get();
  if (!batch.exists) return null;

  return { id: batch.id, ...batch.data() };
}
```

---

## Database Schema

### New Collection: `whatsappSessions`

Tracks which batch is currently active for each organization/importer:

```typescript
{
  organizationId: 'org-123',           // Document ID
  activeBatchId: 'batch-456',          // Current batch receiving WhatsApp messages
  updatedAt: Timestamp
}
```

### Updated Collection: `batches`

```typescript
{
  id: 'batch-123',
  organizationId: 'org-456',
  customerName: 'Maria Rodriguez',
  screenshotIds: ['scr-1', 'scr-2', 'scr-3'],
  screenshotCount: 3,
  status: 'active' | 'processing' | 'completed',
  hasWhatsAppScreenshots: true,
  hasManualScreenshots: false,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## User Experience Flows

### Flow 1: Default Behavior (No Command)

```
Importer sends screenshot (no text command)
  ↓
System checks for active batch
  ↓
If no active batch:
  → Create default batch (named by date)
  → Set as active
  ↓
Add screenshot to active batch
  ↓
Confirm to importer
```

### Flow 2: Creating New Batch via Command

```
Importer: "BATCH: Maria Rodriguez"
  ↓
System: "✓ Switched to batch: Maria Rodriguez"
  ↓
Importer sends 3 screenshots
  ↓
System: "✓ Screenshot 1 added to: Maria Rodriguez"
System: "✓ Screenshot 2 added to: Maria Rodriguez"
System: "✓ Screenshot 3 added to: Maria Rodriguez"
  ↓
Importer: "BATCH: Carlos Mendez"
  ↓
System: "✓ Switched to batch: Carlos Mendez"
  ↓
New screenshots go to Carlos Mendez batch
```

### Flow 3: Web Interface Override

```
Importer sends screenshots via WhatsApp
  ↓
Screenshots appear in WhatsApp Batches page as "unassigned"
  ↓
Importer selects target batch in web interface
  ↓
Clicks "Assign to Selected Batch"
  ↓
Screenshots move to chosen batch
  ↓
Override any WhatsApp command-based assignment
```

---

## Security Rules Update

```javascript
// WhatsApp Sessions collection
match /whatsappSessions/{organizationId} {
  allow read, write: if isSignedIn() &&
                        belongsToOrganization(organizationId);
}
```

---

## Implementation Checklist

- [x] Create WhatsAppBatchManager component
- [x] Add navigation route
- [ ] Implement Cloud Function webhook handler
- [ ] Add command parsing logic
- [ ] Create whatsappSessions collection
- [ ] Update Firestore security rules
- [ ] Test WhatsApp command flow
- [ ] Test web assignment flow
- [ ] Document for end users

---

## Benefits

**Flexibility:**
- Handle multiple customers simultaneously
- Switch between batches easily
- Mix WhatsApp and manual uploads per batch

**Convenience:**
- Command-based control (no app needed)
- Web interface for visual management
- Both methods work together seamlessly

**Organization:**
- Clear batch separation by customer
- No confusion about which screenshots belong where
- Easy to track batch status

**Efficiency:**
- Quick batch switching via text command
- Bulk assignment via web interface
- Real-time feedback on WhatsApp

---

## Future Enhancements

1. **Auto-batch by sender** - Automatically create batches based on forwarded sender
2. **Batch templates** - Pre-define batches for frequent customers
3. **Batch limits** - Set max screenshots per batch
4. **Batch notifications** - Alert when batch reaches certain size
5. **Batch scheduling** - Auto-process batches at specific times

---

**Your importers can now manage batches exactly how they want!** 🎉
