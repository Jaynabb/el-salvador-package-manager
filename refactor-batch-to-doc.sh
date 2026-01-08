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
