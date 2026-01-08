# Batch → Doc Refactoring Guide

## Overview
This document provides a comprehensive guide and scripts to complete the renaming of "Batch" to "Doc" across the entire codebase.

---

## ✅ Already Completed

1. **types.ts** - `Batch` interface → `Doc`, `batchId` → `docId`
2. **src/contexts/DocContext.tsx** - New context created
3. **src/main.tsx** - Updated to use `DocProvider`
4. **src/components/WhatsAppInquiries.tsx** - Updated imports
5. **src/components/AppInquiries.tsx** - Updated imports

---

## 🔧 Step 1: Update Remaining Component Files

### Files That Need Updates:

#### src/components/BatchManager.tsx
**Find/Replace Operations:**
```
useBatches → useDocs
BatchContext → DocContext
Batch (type) → Doc
batches → docs
addBatch → addDoc
updateBatch → updateDoc
deleteBatch → deleteDoc
selectedBatch → selectedDoc
batchId → docId
exportBatchToGoogleDoc → exportDocToGoogleDoc
```

**Manual Changes Needed:**
- Rename file: `BatchManager.tsx` → `DocManager.tsx`
- Update UI text: "Batch Manager" → "Doc Manager"
- Update UI text: "batch" → "doc" in user-facing strings

---

#### src/components/WhatsAppInquiries.tsx & src/components/AppInquiries.tsx

**Find/Replace Operations:**
```
Batch (type) → Doc
batches → docs
addBatch → addDoc
updateBatch → updateDoc
deleteBatch → deleteDoc
batchId → docId
assignedToBatch → assignedToDoc
selectedBatch → selectedDoc
exportBatchToGoogleDoc → exportDocToGoogleDoc
```

**Functional Changes Needed:**
1. **Remove "Active Batches/Docs" section** - This should only appear in Doc Manager
2. **Add dropdown selector per message/inquiry** for doc assignment
3. Keep only unassigned inquiries visible
4. Simple dropdown to assign each inquiry to an existing doc

---

#### src/App.tsx
**Find/Replace:**
```
batch-manager → doc-manager
Batch Manager → Doc Manager
BatchManager → DocManager (import)
```

---

#### src/components/Dashboard.tsx
**Find/Replace:**
```
Batch (type) → Doc
batches → docs
totalBatches → totalDocs
batchesReadyToExport → docsReadyToExport
batch-manager → doc-manager
Batch Manager → Doc Manager
"Batch" (UI text) → "Doc"
```

---

#### src/services/batchExportService.ts
**Changes:**
- Rename file: `batchExportService.ts` → `docExportService.ts`
- Find/Replace: `Batch` → `Doc`, `batch` → `doc`
- Update function name: `exportBatchToGoogleDoc` → `exportDocToGoogleDoc`

---

## 🔧 Step 2: Automated Refactoring Script

Save this as `refactor-batch-to-doc.sh` and run with Git Bash:

```bash
#!/bin/bash

# Batch to Doc Refactoring Script
# Run this from the project root directory

echo "🔄 Starting Batch → Doc refactoring..."

# Function to perform find-replace in a file
refactor_file() {
    local file=$1
    echo "  📝 Processing: $file"

    # Perform replacements (order matters!)
    sed -i 's/useBatches/useDocs/g' "$file"
    sed -i 's/BatchContext/DocContext/g' "$file"
    sed -i 's/BatchProvider/DocProvider/g' "$file"
    sed -i 's/addBatch/addDoc/g' "$file"
    sed -i 's/updateBatch/updateDoc/g' "$file"
    sed -i 's/deleteBatch/deleteDoc/g' "$file"
    sed -i 's/selectedBatch/selectedDoc/g' "$file"
    sed -i 's/newBatch/newDoc/g' "$file"
    sed -i 's/exportBatchToGoogleDoc/exportDocToGoogleDoc/g' "$file"
    sed -i 's/batchId/docId/g' "$file"
    sed -i 's/batchData/docData/g' "$file"
    sed -i 's/mockBatches/mockDocs/g' "$file"
    sed -i 's/assignedToBatch/assignedToDoc/g' "$file"
    sed -i 's/: Batch\b/: Doc/g' "$file"
    sed -i 's/<Batch>/<Doc>/g' "$file"
    sed -i 's/<Batch\[/<Doc[/g' "$file"
    sed -i 's/Batch\[\]/Doc[]/g' "$file"
    sed -i 's/\bbatches\b/docs/g' "$file"

    echo "  ✅ Completed: $file"
}

# Update component files
refactor_file "src/components/BatchManager.tsx"
refactor_file "src/components/WhatsAppInquiries.tsx"
refactor_file "src/components/AppInquiries.tsx"
refactor_file "src/App.tsx"
refactor_file "src/components/Dashboard.tsx"

# Rename and update service file
if [ -f "src/services/batchExportService.ts" ]; then
    echo "  📝 Renaming: batchExportService.ts → docExportService.ts"
    mv "src/services/batchExportService.ts" "src/services/docExportService.ts"
    refactor_file "src/services/docExportService.ts"
fi

# Rename BatchManager component file
if [ -f "src/components/BatchManager.tsx" ]; then
    echo "  📝 Renaming: BatchManager.tsx → DocManager.tsx"
    mv "src/components/BatchManager.tsx" "src/components/DocManager.tsx"
fi

# Delete old BatchContext file
if [ -f "src/contexts/BatchContext.tsx" ]; then
    echo "  🗑️  Removing: BatchContext.tsx (replaced by DocContext.tsx)"
    rm "src/contexts/BatchContext.tsx"
fi

echo ""
echo "✅ Refactoring complete!"
echo ""
echo "⚠️  MANUAL STEPS STILL REQUIRED:"
echo "1. Update DocManager.tsx UI text: 'Batch' → 'Doc' in all user-facing strings"
echo "2. Update WhatsAppInquiries.tsx - remove 'Active Docs' section"
echo "3. Update AppInquiries.tsx - remove 'Active Docs' section"
echo "4. Add doc dropdown selectors to inquiry components"
echo "5. Test the application thoroughly"
echo ""
echo "Run 'npm run dev' to start the development server"
```

---

## 🔧 Step 3: Update Import Statements

After running the script, you may need to manually fix some import statements:

**In all files that imported from batchExportService:**
```typescript
// OLD
import { exportBatchToGoogleDoc } from '../services/batchExportService';

// NEW
import { exportDocToGoogleDoc } from '../services/docExportService';
```

---

## 🔧 Step 4: UI Text Updates

### Files with User-Facing Text to Update:

#### src/components/DocManager.tsx (formerly BatchManager.tsx)
- "Batch Manager" → "Doc Manager"
- "Create Batch" → "Create Doc"
- "New Batch" → "New Doc"
- "Batch Details" → "Doc Details"
- "Batch Summary" → "Doc Summary"
- "batch" → "doc" in alerts/messages

#### src/components/WhatsAppInquiries.tsx
- "Assign to Selected Batch" → "Assign to Selected Doc"
- "Create New Batch" → "Create New Doc"
- Remove entire "Active Batches" section
- Add simple dropdown selector per message

#### src/components/AppInquiries.tsx
- Same changes as WhatsAppInquiries.tsx

#### src/App.tsx
- Navigation button: "Batch Manager" → "Doc Manager"

#### src/components/Dashboard.tsx
- "Batch Manager" → "Doc Manager"
- "Batch Statistics" → "Doc Statistics"
- "Total Batches" → "Total Docs"
- "Ready to Export" label context: "Batches" → "Docs"

---

## 🔧 Step 5: Weight Tracking Feature

### Add to Screenshot interface (types.ts):
```typescript
export interface Screenshot {
  // ... existing fields ...

  // Individual screenshot weight
  manualWeight?: number; // Manual weight override
  calculatedWeight?: number; // Sum of item weights
}
```

### Update DocManager to show per-order weight:
- Display calculated weight from items
- Allow manual weight input per screenshot
- Show total doc weight (sum of all screenshots)

---

## 📋 Verification Checklist

After running the script and manual updates:

- [ ] App compiles without errors
- [ ] Can navigate to Doc Manager
- [ ] Can create new docs
- [ ] Can assign inquiries to docs
- [ ] WhatsApp Inquiries shows dropdown per message
- [ ] App Inquiries shows dropdown per inquiry
- [ ] Doc Manager shows all docs and their contents
- [ ] Export functionality still works
- [ ] No "Batch" terminology visible in UI
- [ ] Weight tracking shows per order
- [ ] Total weight calculated correctly

---

## 🚀 Execution Steps

1. **Backup your work** (commit current changes)
2. Save the bash script as `refactor-batch-to-doc.sh` in project root
3. Make it executable: `chmod +x refactor-batch-to-doc.sh`
4. Run it: `./refactor-batch-to-doc.sh`
5. Complete manual steps listed above
6. Test thoroughly
7. Commit changes

---

## ⚠️ Troubleshooting

If you encounter errors after running the script:

1. **Check imports** - Make sure all components import from `DocContext` not `BatchContext`
2. **Check types** - Ensure all `Batch` types are now `Doc`
3. **Check service imports** - Update `batchExportService` → `docExportService`
4. **Clear Vite cache** - Delete `node_modules/.vite` and restart dev server
5. **Browser cache** - Hard refresh your browser (Ctrl+Shift+R)

---

## 📝 Notes

- The script preserves existing functionality while updating terminology
- Some manual UI refinements will be needed after the script runs
- Weight tracking feature requires additional implementation after refactoring
- Test each component individually after changes
