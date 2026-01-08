import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDocs } from '../contexts/DocContext';
import { db } from '../services/firebase';
import {
  collection,
  doc as firebaseDoc,
  updateDoc as firebaseUpdateDoc,
  addDoc as firebaseAddDoc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import type { Doc, Screenshot, Importer } from '../types';
import { analyzeOrderScreenshot } from '../services/geminiService';
import { completeMVPExport } from '../services/mvpExportService';
import { detectTaxSplit } from '../services/taxSplitDetection';
import { getNextPackageNumber } from '../services/packageNumbering';

const CURRENT_IMPORTER_ID = 'default'; // TODO: Get from auth context

export default function DocManager() {
  const { currentUser } = useAuth();
  const { docs, screenshots: allScreenshots, addDoc, updateDoc, deleteDoc } = useDocs();
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [editingScreenshot, setEditingScreenshot] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<any>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [importer, setImporter] = useState<Importer | null>(null);
  const [taxSplitNames, setTaxSplitNames] = useState<{[key: string]: string}>({});
  const [editingDocName, setEditingDocName] = useState(false);
  const [manualSplits, setManualSplits] = useState<Array<{id: string; name: string; value: number}>>([]);
  const [editedSplitValues, setEditedSplitValues] = useState<{[key: string]: number}>({});

  // Load importer data for OAuth export
  useEffect(() => {
    const loadImporter = async () => {
      if (!currentUser?.importerId || !db) return;

      try {
        const importerDoc = await getDoc(firebaseDoc(db, 'importers', currentUser.importerId));
        if (importerDoc.exists()) {
          setImporter({
            id: importerDoc.id,
            ...importerDoc.data(),
            createdAt: importerDoc.data().createdAt?.toDate(),
            updatedAt: importerDoc.data().updatedAt?.toDate(),
            googleTokenExpiry: importerDoc.data().googleTokenExpiry?.toDate(),
          } as Importer);
        }
      } catch (error) {
        console.error('Error loading importer:', error);
      }
    };

    loadImporter();
  }, [currentUser]);

  // Select first doc by default
  useEffect(() => {
    if (docs.length > 0 && !selectedDoc) {
      setSelectedDoc(docs[0]);
      setCustomerName(docs[0].customerName || '');
      setWeightUnit(docs[0].weightUnit || 'kg');
    }
  }, [docs]);

  // Get screenshots for selected doc
  const screenshots = selectedDoc
    ? allScreenshots.filter(s => s.docId === selectedDoc.id)
    : [];

  const createNewDoc = async () => {
    try {
      // Get next sequential package number
      const orgId = currentUser?.organizationId || 'test-org';
      const { packageNumber, sequenceNumber } = await getNextPackageNumber(orgId);

      const docId = await addDoc({
        importerId: CURRENT_IMPORTER_ID,
        organizationId: orgId,
        customerName: 'New Doc',
        screenshotIds: [],
        screenshotCount: 0,
        status: 'draft',
        hasWhatsAppScreenshots: false,
        hasManualScreenshots: true,
        packageNumber, // Sequential: Paquete #1, #2, etc.
        sequenceNumber,
        dateArrived: new Date() // Set when doc created
      });

      const newDoc = docs.find(b => b.id === docId);
      if (newDoc) {
        setSelectedDoc(newDoc);
        setCustomerName('');
      }

      console.log(`✓ Created new doc: ${packageNumber}`);
    } catch (error) {
      console.error('Error creating doc:', error);
      alert('Failed to create new doc');
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Create doc if none exists
    if (!selectedDoc) {
      await createNewDoc();
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const currentDoc = selectedDoc;
    if (!currentDoc) {
      alert('Failed to create doc. Please try again.');
      return;
    }

    setUploading(true);

    try {
      const newScreenshots: Screenshot[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Convert to base64
        const base64 = await fileToBase64(file);

        // Store screenshot
        const screenshotRef = await firebaseAddDoc(collection(db!, 'screenshots'), {
          docId: currentDoc.id,
          imageBase64: base64,
          imageType: file.type,
          source: 'manual',
          extractionStatus: 'pending',
          importerId: CURRENT_IMPORTER_ID,
          uploadedAt: Timestamp.fromDate(new Date())
        });

        const screenshot: Screenshot = {
          id: screenshotRef.id,
          docId: currentDoc.id,
          imageBase64: base64,
          imageType: file.type,
          source: 'manual',
          extractionStatus: 'pending',
          importerId: CURRENT_IMPORTER_ID,
          uploadedAt: new Date()
        };

        newScreenshots.push(screenshot);

        // Extract data with AI in background
        processScreenshot(screenshotRef.id, base64);
      }

      // Update doc
      await updateDoc(currentDoc.id, {
        screenshotIds: [...(currentDoc.screenshotIds || []), ...newScreenshots.map(s => s.id)],
        screenshotCount: (currentDoc.screenshotCount || 0) + newScreenshots.length,
        hasManualScreenshots: true
      });

      alert(`✅ ${newScreenshots.length} screenshot(s) uploaded successfully!`);
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Failed to upload screenshots');
    } finally {
      setUploading(false);
    }
  };

  const processScreenshot = async (screenshotId: string, base64: string) => {
    try {
      // Update status to pending (will be completed after extraction)
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        extractionStatus: 'pending'
      });

      // Call Gemini AI with enhanced MVP analyzer
      const extracted = await analyzeOrderScreenshot(base64);

      // Update with results
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        extractedData: extracted,
        extractionStatus: 'completed',
        processedAt: Timestamp.fromDate(new Date())
      });

      // Data updates automatically via context
    } catch (error) {
      console.error('Error extracting data:', error);
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        extractionStatus: 'error',
        extractionError: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const updateCustomerName = async (name: string) => {
    setCustomerName(name);

    if (selectedDoc) {
      await updateDoc(selectedDoc.id, {
        customerName: name
      });
    }
  };

  const updateWeightUnit = async (unit: 'kg' | 'lb') => {
    setWeightUnit(unit);

    if (selectedDoc) {
      await updateDoc(selectedDoc.id, {
        weightUnit: unit
      });
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('⚠️ Delete this doc?\n\nThis will permanently delete the doc and all its screenshots. This cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(docId);

      // Clear selection if deleted doc was selected
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setCustomerName('');
        setWeightUnit('kg');
      }

      alert('✅ Doc deleted successfully!');
    } catch (error) {
      console.error('Error deleting doc:', error);
      alert('❌ Failed to delete doc. Please try again.');
    }
  };

  // This function is deprecated in favor of handleExportDoc
  // Keeping for backward compatibility
  const processDoc = async () => {
    return handleExportDoc();
  };

  const handleExportDoc = async () => {
    if (!selectedDoc) {
      alert('No selected doc to export');
      return;
    }

    if (!customerName) {
      alert('❌ Cannot export doc without a customer name.\n\nPlease set a customer name first.');
      return;
    }

    if (screenshots.length === 0) {
      alert('❌ Cannot export empty doc.\n\nAdd screenshots to this doc first.');
      return;
    }

    // Check if human review is required
    if (!selectedDoc.humanReviewed) {
      alert('❌ Human Review Required\n\nPlease check the "Human Review Complete" checkbox before exporting.\n\nThis ensures all data has been manually verified.');
      return;
    }

    setProcessing(true);
    try {
      // Detect tax splits before exporting
      const taxSplitResult = detectTaxSplit(selectedDoc, screenshots);
      let exportCustomerName = customerName;

      if (taxSplitResult.isTaxSplit) {
        // Calculate total value
        const totalValue = screenshots.reduce((sum, s) =>
          sum + (s.extractedData?.orderTotal || 0), 0
        );

        // Use real customer name for export (splits will use dummy names for additional splits)
        if (totalValue > 200) {
          const confirmed = confirm(
            `⚠️ TAX SPLIT DETECTED - VALUE OVER $200\n\n` +
            `${taxSplitResult.reason}\n\n` +
            `Total Value: $${totalValue.toFixed(2)}\n\n` +
            `First split will use real customer name: "${customerName}"\n` +
            `Additional splits will use dummy names.\n\n` +
            `Customer Groups:\n` +
            taxSplitResult.customerGroups.map((g, i) =>
              `  ${i + 1}. ${g.name}: $${g.value.toFixed(2)}`
            ).join('\n') +
            `\n\nDo you want to continue with export?`
          );

          if (!confirmed) {
            return;
          }
        } else {
          const confirmed = confirm(
            `⚠️ TAX SPLIT DETECTED\n\n` +
            `${taxSplitResult.reason}\n\n` +
            `Total Value: $${totalValue.toFixed(2)}\n\n` +
            `Customer Groups:\n` +
            taxSplitResult.customerGroups.map((g, i) =>
              `  ${i + 1}. ${g.name}: $${g.value.toFixed(2)}`
            ).join('\n') +
            `\n\nDo you want to continue with export?`
          );

          if (!confirmed) {
            return;
          }
        }
      }

      // Export using MVP format (Google Doc + Google Sheet)
      // Pass importer for OAuth-based export if connected
      const result = await completeMVPExport(selectedDoc, screenshots, importer || undefined);

      if (result.success) {
        const totalValue = screenshots.reduce((sum, s) =>
          sum + (s.extractedData?.orderTotal || 0), 0
        );
        const totalPieces = screenshots.reduce((sum, s) =>
          sum + (s.extractedData?.totalPieces || 0), 0
        );

        let message = `✅ Doc exported successfully!\n\n` +
          `Package: ${selectedDoc.packageNumber || 'N/A'}\n` +
          `Customer: ${customerName}\n` +
          `Orders: ${screenshots.length}\n` +
          `Total Pieces: ${totalPieces}\n` +
          `Total Value: $${totalValue.toFixed(2)}\n`;

        if (taxSplitResult.isTaxSplit) {
          message += `\n⚠️ TAX SPLIT: ${taxSplitResult.reason}\n`;
        }

        if (result.docUrl) {
          message += `\n📄 Google Doc:\n${result.docUrl}\n`;
        }
        if (result.sheetUrl) {
          message += `\n📊 Google Sheet:\n${result.sheetUrl}\n`;
        }

        message += `\n(Demo Mode - Check console for details)`;

        alert(message);
      } else {
        alert(
          `❌ Export failed\n\n` +
          `Errors:\n` +
          result.errors.join('\n')
        );
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Error exporting doc.\n\nPlease try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleStartEdit = (screenshot: Screenshot) => {
    setEditingScreenshot(screenshot.id);
    setEditedData(screenshot.extractedData ? JSON.parse(JSON.stringify(screenshot.extractedData)) : {
      trackingNumber: '',
      orderNumber: '',
      seller: '',
      orderDate: '',
      items: [],
      orderTotal: 0
    });
  };

  const handleSaveEdit = async (screenshotId: string) => {
    try {
      // Update screenshot with edited data
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        extractedData: editedData,
        extractionStatus: 'completed'
      });

      // Data updates automatically via context

      setEditingScreenshot(null);
      setEditedData(null);
      alert('✅ Changes saved!');
    } catch (error) {
      console.error('Error saving edits:', error);
      alert('❌ Failed to save changes. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingScreenshot(null);
    setEditedData(null);
  };

  const handleUpdateField = (field: string, value: any) => {
    setEditedData((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    setEditedData((prev: any) => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        [field]: field === 'quantity' || field === 'unitValue' || field === 'weight'
          ? (value === '' ? undefined : parseFloat(value) || 0)
          : value
      };

      // Recalculate item total
      if (field === 'quantity' || field === 'unitValue') {
        newItems[index].totalValue = newItems[index].quantity * newItems[index].unitValue;
      }

      // Recalculate order total
      const orderTotal = newItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);

      return {
        ...prev,
        items: newItems,
        orderTotal
      };
    });
  };

  const handleAddItem = () => {
    setEditedData((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          name: '',
          quantity: 1,
          unitValue: 0,
          totalValue: 0,
          hsCode: ''
        }
      ]
    }));
  };

  const handleRemoveItem = (index: number) => {
    setEditedData((prev: any) => {
      const newItems = prev.items.filter((_: any, i: number) => i !== index);
      const orderTotal = newItems.reduce((sum: number, item: any) => sum + (item.totalValue || 0), 0);

      return {
        ...prev,
        items: newItems,
        orderTotal
      };
    });
  };

  const handleRemoveScreenshot = async (screenshotId: string) => {
    if (!confirm('Remove this screenshot from the doc?\n\nThe screenshot will be deleted.')) {
      return;
    }

    try {
      // Delete from Firestore
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        docId: null
      });

      // Update doc
      if (selectedDoc) {
        await updateDoc(selectedDoc.id, {
          screenshotIds: (selectedDoc.screenshotIds || []).filter(id => id !== screenshotId),
          screenshotCount: Math.max(0, (selectedDoc.screenshotCount || 0) - 1)
        });
      }

      alert('✅ Screenshot removed from doc');
    } catch (error) {
      console.error('Error removing screenshot:', error);
      alert('❌ Failed to remove screenshot. Please try again.');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix - check for valid format
        const parts = result.split(',');
        if (parts.length < 2) {
          reject(new Error('Invalid data URL format'));
          return;
        }
        const base64 = parts[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📦 Doc Manager</h1>
            <p className="text-slate-400 mt-1">
              Manage docs and their assigned screenshots from WhatsApp and App inquiries
            </p>
          </div>
          <button
            onClick={createNewDoc}
            className="px-6 py-3 bg-green-600 text-white hover:bg-green-700 rounded-lg font-medium transition-colors"
          >
            ✨ Create New Doc
          </button>
        </div>
      </div>

      {/* Active Docs - Visual Card List */}
      {docs.length > 0 && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">📋 Active Docs ({docs.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map(doc => (
              <div
                key={doc.id}
                onClick={() => {
                  setSelectedDoc(doc);
                  setCustomerName(doc.customerName || '');
                  setWeightUnit(doc.weightUnit || 'kg');
                }}
                className={`relative bg-slate-700 rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-lg ${
                  selectedDoc?.id === doc.id
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDoc(doc.id);
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors z-10"
                  title="Delete Doc"
                >
                  🗑️
                </button>

                {/* Doc Info */}
                <div className="mb-3">
                  <div className="text-white font-bold text-lg mb-1 pr-8">
                    {doc.customerName || 'Unnamed Doc'}
                  </div>
                  <div className="text-slate-300 text-sm">
                    📸 {doc.screenshotCount} screenshot{doc.screenshotCount !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    doc.status === 'completed' ? 'bg-green-600 text-white' :
                    'bg-blue-600 text-white'
                  }`}>
                    {doc.status === 'completed' ? '✅ Completed' :
                     '📝 Draft'}
                  </span>

                  {doc.weight && (
                    <span className="px-2 py-1 rounded text-xs bg-slate-600 text-slate-300">
                      ⚖️ {doc.weight} {doc.weightUnit}
                    </span>
                  )}
                </div>

                {/* Source Icons */}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {doc.hasWhatsAppScreenshots && <span>📱 WhatsApp</span>}
                  {doc.hasManualScreenshots && <span>💻 Manual</span>}
                </div>

                {/* Selected Indicator */}
                {selectedDoc?.id === doc.id && (
                  <div className="absolute bottom-2 right-2 text-blue-400 text-xs font-medium">
                    ✓ Selected
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Doc Details */}
      {selectedDoc ? (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              {selectedDoc.customerName || 'Unnamed'}
            </h2>
            {selectedDoc.packageNumber && (
              <div className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-lg">
                {selectedDoc.packageNumber}
              </div>
            )}
          </div>

          {/* Screenshots with Extracted Data - For Verification */}
          {screenshots.length > 0 && (() => {
            // Group screenshots by customer
            const customerGroups = screenshots.reduce((groups, screenshot) => {
              const customerName = screenshot.customerName || 'Unknown Customer';
              if (!groups[customerName]) {
                groups[customerName] = [];
              }
              groups[customerName].push(screenshot);
              return groups;
            }, {} as Record<string, typeof screenshots>);

            return (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">
                    Customer Inquiries ({Object.keys(customerGroups).length} customers, {screenshots.length} orders)
                  </h3>
                  <div className="text-xs text-slate-400">
                    ⚠️ Verify extracted data against screenshots before processing
                  </div>
                </div>

                <div className="space-y-6">
                  {Object.entries(customerGroups).map(([customerName, customerScreenshots]) => (
                    <div key={customerName} className="bg-slate-750 rounded-lg border-2 border-slate-600 overflow-hidden">
                      {/* Customer Header */}
                      <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-4 py-3 border-b-2 border-blue-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                              {customerName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              {editingDocName ? (
                                <input
                                  type="text"
                                  value={customerName}
                                  onChange={(e) => updateCustomerName(e.target.value)}
                                  onBlur={() => setEditingDocName(false)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      setEditingDocName(false);
                                    }
                                  }}
                                  placeholder="Enter customer name..."
                                  autoFocus
                                  className="px-3 py-1 bg-blue-700 border border-blue-500 rounded text-white text-lg font-bold focus:outline-none focus:border-white"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div
                                    onClick={() => setEditingDocName(true)}
                                    className="text-white font-bold text-lg cursor-pointer hover:text-blue-200 transition-colors"
                                    title="Click to edit customer name"
                                  >
                                    {customerName || <span className="text-blue-300 italic">Click to set name...</span>}
                                  </div>
                                  <button
                                    onClick={() => setEditingDocName(true)}
                                    className="text-blue-300 hover:text-white transition-colors text-sm"
                                    title="Edit customer name"
                                  >
                                    ✏️
                                  </button>
                                </div>
                              )}
                              {customerScreenshots[0]?.phoneNumber && (
                                <div className="text-blue-200 text-sm">{customerScreenshots[0].phoneNumber}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-blue-200 text-sm">
                            {customerScreenshots.length} order{customerScreenshots.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>

                      {/* Customer's Orders */}
                      <div className="p-4 space-y-4">
                        {customerScreenshots.map((screenshot, orderIdx) => (
                          <div key={screenshot.id} className="bg-slate-700 rounded-lg border border-slate-600 overflow-hidden">
                            {/* Order Header */}
                            <div className="bg-slate-600 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="text-white font-semibold">
                                  Order #{orderIdx + 1}
                                  {customerScreenshots.length > 1 && ` of ${customerScreenshots.length}`}
                                </div>
                                <div className={`text-xs px-2 py-1 rounded ${
                                  screenshot.source === 'whatsapp'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-blue-600 text-white'
                                }`}>
                                  {screenshot.source === 'whatsapp' ? '📱 WhatsApp' : '💻 Manual'}
                                </div>
                                <div className={`text-xs px-2 py-1 rounded ${
                                  screenshot.extractionStatus === 'completed' ? 'bg-green-600 text-white' :
                                  screenshot.extractionStatus === 'error' ? 'bg-red-600 text-white' :
                                  'bg-slate-500 text-white'
                                }`}>
                                  {screenshot.extractionStatus === 'completed' ? '✅ Extracted' :
                                   screenshot.extractionStatus === 'error' ? '❌ Error' :
                                   '⏳ Pending'}
                                </div>
                              </div>
                              <div className="text-xs text-slate-300">
                                {new Date(screenshot.uploadedAt).toLocaleString()}
                              </div>
                            </div>

                            {/* Content: Screenshot + Extracted Data Side by Side */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                              {/* Left: Screenshot Image */}
                              <div>
                                <div className="text-xs text-slate-400 mb-2 font-semibold">📷 Original Screenshot</div>
                                <div className="bg-slate-800 rounded-lg p-2 border border-slate-600">
                                  <img
                                    src={`data:${screenshot.imageType};base64,${screenshot.imageBase64}`}
                                    alt={`${customerName} - Order ${orderIdx + 1}`}
                                    className="w-full rounded cursor-pointer hover:opacity-90"
                                    onClick={() => window.open(`data:${screenshot.imageType};base64,${screenshot.imageBase64}`, '_blank')}
                                    title="Click to view full size"
                                  />
                                </div>
                              </div>

                              {/* Right: Extracted Data */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs text-slate-400 font-semibold">🤖 AI-Extracted Data</div>
                                  <div className="flex gap-2">
                            {editingScreenshot === screenshot.id ? (
                              <>
                                <button
                                  onClick={() => handleSaveEdit(screenshot.id)}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                                >
                                  💾 Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded"
                                >
                                  ✖️ Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartEdit(screenshot)}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                                  disabled={screenshot.extractionStatus !== 'completed'}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => handleRemoveScreenshot(screenshot.id)}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                                >
                                  🗑️ Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {screenshot.extractedData ? (
                          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600 space-y-3">
                            {editingScreenshot === screenshot.id ? (
                              /* EDIT MODE */
                              <>
                                {/* Tracking Number - Editable */}
                                <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Tracking Number</label>
                                  <input
                                    type="text"
                                    value={editedData?.trackingNumber || ''}
                                    onChange={(e) => handleUpdateField('trackingNumber', e.target.value)}
                                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-blue-400 text-sm focus:border-blue-500 focus:outline-none"
                                    placeholder="Enter tracking number"
                                  />
                                </div>

                                {/* Order Number - Editable */}
                                <div>
                                  <label className="text-xs text-slate-400 mb-1 block">Order Number</label>
                                  <input
                                    type="text"
                                    value={editedData?.orderNumber || ''}
                                    onChange={(e) => handleUpdateField('orderNumber', e.target.value)}
                                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300 text-sm focus:border-blue-500 focus:outline-none"
                                    placeholder="Enter order number"
                                  />
                                </div>
                              </>
                            ) : (
                              /* VIEW MODE */
                              <>
                                {/* Tracking Number */}
                                {screenshot.extractedData.trackingNumber && (
                                  <div>
                                    <div className="text-xs text-slate-400 mb-1">Tracking Number</div>
                                    <code className="bg-slate-900 px-2 py-1 rounded text-blue-400 text-sm">
                                      {screenshot.extractedData.trackingNumber}
                                    </code>
                                  </div>
                                )}

                                {/* Order Number */}
                                {screenshot.extractedData.orderNumber && (
                                  <div>
                                    <div className="text-xs text-slate-400 mb-1">Order Number</div>
                                    <div className="text-slate-300 text-sm">{screenshot.extractedData.orderNumber}</div>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Items */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs text-slate-400">
                                  Items ({editingScreenshot === screenshot.id ? editedData?.items?.length || 0 : screenshot.extractedData.items.length})
                                </div>
                                {editingScreenshot === screenshot.id && (
                                  <button
                                    onClick={handleAddItem}
                                    className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                                  >
                                    + Add Item
                                  </button>
                                )}
                              </div>
                              <div className="space-y-2">
                                {editingScreenshot === screenshot.id ? (
                                  /* EDIT MODE - Editable Items */
                                  editedData?.items?.map((item: any, itemIdx: number) => (
                                    <div key={itemIdx} className="bg-slate-900 rounded p-3 space-y-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <input
                                          type="text"
                                          value={item.name}
                                          onChange={(e) => handleUpdateItem(itemIdx, 'name', e.target.value)}
                                          placeholder="Item name"
                                          className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                        <button
                                          onClick={() => handleRemoveItem(itemIdx)}
                                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                                          title="Remove item"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                      <div className="grid grid-cols-4 gap-2">
                                        <div>
                                          <label className="text-xs text-slate-400 block mb-1">Quantity</label>
                                          <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => handleUpdateItem(itemIdx, 'quantity', e.target.value)}
                                            className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none"
                                            min="1"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs text-slate-400 block mb-1">Unit Price</label>
                                          <input
                                            type="number"
                                            value={item.unitValue}
                                            onChange={(e) => handleUpdateItem(itemIdx, 'unitValue', e.target.value)}
                                            className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none"
                                            step="0.01"
                                            min="0"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs text-slate-400 block mb-1">Weight ({weightUnit})</label>
                                          <input
                                            type="number"
                                            value={item.weight || ''}
                                            onChange={(e) => handleUpdateItem(itemIdx, 'weight', e.target.value)}
                                            placeholder="0"
                                            className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs focus:border-blue-500 focus:outline-none"
                                            step="0.01"
                                            min="0"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs text-slate-400 block mb-1">Total</label>
                                          <div className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-green-400 text-xs font-semibold">
                                            ${item.totalValue?.toFixed(2) || '0.00'}
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-xs text-slate-400 block mb-1">HS Code (Optional)</label>
                                        <input
                                          type="text"
                                          value={item.hsCode || ''}
                                          onChange={(e) => handleUpdateItem(itemIdx, 'hsCode', e.target.value)}
                                          placeholder="e.g., 3926.90"
                                          className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 text-xs focus:border-blue-500 focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  /* VIEW MODE - Display Only */
                                  screenshot.extractedData.items.map((item, itemIdx) => (
                                    <div key={itemIdx} className="bg-slate-900 rounded px-3 py-2">
                                      <div className="text-white text-sm font-medium">{item.name}</div>
                                      <div className="grid grid-cols-4 gap-2 mt-1 text-xs">
                                        <div>
                                          <span className="text-slate-400">Qty:</span>
                                          <span className="text-white ml-1">{item.quantity || 0}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400">Unit:</span>
                                          <span className="text-white ml-1">${item.unitValue ? item.unitValue.toFixed(2) : '0.00'}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400">Weight:</span>
                                          <span className="text-white ml-1">{item.weight ? `${item.weight} ${weightUnit}` : '-'}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400">Total:</span>
                                          <span className="text-green-400 ml-1 font-semibold">${item.totalValue ? item.totalValue.toFixed(2) : '0.00'}</span>
                                        </div>
                                      </div>
                                      {item.hsCode && (
                                        <div className="text-xs text-slate-400 mt-1">
                                          HS Code: <span className="text-slate-300">{item.hsCode}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* Order Total */}
                            <div className="pt-3 border-t border-slate-700">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 text-sm">Order Total:</span>
                                <span className="text-green-400 text-lg font-bold">
                                  ${editingScreenshot === screenshot.id
                                    ? (editedData?.orderTotal?.toFixed(2) || '0.00')
                                    : (screenshot.extractedData.orderTotal?.toFixed(2) || '0.00')}
                                </span>
                              </div>
                              {/* Order Weight Total */}
                              {(() => {
                                const items = editingScreenshot === screenshot.id ? editedData?.items : screenshot.extractedData.items;
                                const orderWeight = items?.reduce((sum: number, item: any) => sum + (item.weight || 0), 0) || 0;
                                if (orderWeight > 0) {
                                  return (
                                    <div className="flex items-center justify-between mt-2">
                                      <span className="text-slate-400 text-sm">⚖️ Order Weight:</span>
                                      <span className="text-blue-400 text-lg font-bold">
                                        {orderWeight.toFixed(2)} {weightUnit}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              {editingScreenshot === screenshot.id && (
                                <div className="text-xs text-slate-400 mt-1">
                                  💡 Totals update automatically when you change values
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600 text-center text-slate-400">
                            {screenshot.extractionStatus === 'error'
                              ? `❌ Extraction failed: ${screenshot.extractionError || 'Unknown error'}`
                              : '⏳ Waiting for AI extraction...'}
                          </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Per-Customer Tax Split */}
                      {(() => {
                        // Calculate customer's total value
                        const customerTotal = customerScreenshots.reduce((sum, s) =>
                          sum + (s.extractedData?.orderTotal || 0), 0
                        );

                        // Check if this customer needs tax split (> $200)
                        if (customerTotal <= 200) return null;

                        const [firstName, ...rest] = customerName.split(' ');
                        const lastNameOptions = ['Valdez', 'Morales', 'Jimenez', 'Castro', 'Ortiz', 'Reyes', 'Mendoza', 'Vargas', 'Rojas', 'Chavez'];

                        // Calculate split values - use round numbers for all splits except last
                        const numSplits = Math.ceil(customerTotal / 199);
                        const splitAmount = 190; // Nice round number under $200

                        const splits = [];
                        let remaining = customerTotal;

                        for (let i = 0; i < numSplits; i++) {
                          if (i === numSplits - 1) {
                            // Last split gets the remainder
                            splits.push({
                              name: `${firstName} ${lastNameOptions[i % lastNameOptions.length]}`,
                              value: remaining
                            });
                          } else {
                            // Use round split amount for all but last
                            splits.push({
                              name: `${firstName} ${lastNameOptions[i % lastNameOptions.length]}`,
                              value: splitAmount
                            });
                            remaining -= splitAmount;
                          }
                        }

                        return (
                          <div className="mt-4 bg-yellow-900/20 border-2 border-yellow-600 rounded-lg p-4 mx-4 mb-4">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="text-2xl">⚠️</div>
                              <div className="flex-1">
                                <div className="text-yellow-300 font-bold text-base mb-1">
                                  TAX SPLIT REQUIRED
                                </div>
                                <div className="text-yellow-200 text-sm">
                                  Total value ${customerTotal.toFixed(2)} &gt; $200. Split into {numSplits} declarations.
                                </div>
                              </div>
                            </div>

                            {/* Split Breakdown */}
                            <div className="space-y-2 mt-3">
                              <div className="text-white font-semibold text-sm">Suggested Split:</div>
                              {splits.map((split, idx) => (
                                <div key={idx} className="bg-slate-700/50 rounded-lg p-3 border border-yellow-600/30">
                                  <div className="flex items-center justify-between">
                                    <div className="text-white text-sm">{split.name}</div>
                                    <div className="text-yellow-300 font-bold">${split.value.toFixed(2)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>

                {/* Doc Summary */}
                <div className="mt-6 bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-3">📊 Doc Summary</h4>
                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <div className="text-xs text-blue-300">Customers</div>
                      <div className="text-2xl font-bold text-white">{Object.keys(customerGroups).length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-300">Total Orders</div>
                      <div className="text-2xl font-bold text-white">{screenshots.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-300">Total Value</div>
                      <div className="text-2xl font-bold text-green-400">
                        ${screenshots.reduce((sum, s) => sum + (s.extractedData?.orderTotal || 0), 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-300">Total Pieces</div>
                      <div className="text-2xl font-bold text-purple-400">
                        {screenshots.reduce((sum, s) => sum + (s.extractedData?.totalPieces || 0), 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-300">Tracking Numbers</div>
                      <div className="text-2xl font-bold text-white">
                        {screenshots.filter(s => s.extractedData?.trackingNumber).length}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* Tax Split Breakdown & Export Section */}
          {screenshots.length > 0 && (() => {
            if (!selectedDoc) return null;
            const taxSplitResult = detectTaxSplit(selectedDoc, screenshots);

            // Get first customer name from screenshots for generating split names
            const firstCustomerName = screenshots.find(s => s.customerName || s.extractedData?.customerName)?.customerName
              || screenshots.find(s => s.extractedData?.customerName)?.extractedData?.customerName
              || customerName
              || 'Customer';

            const lastNameOptions = ['Valdez', 'Morales', 'Jimenez', 'Castro', 'Ortiz', 'Reyes', 'Mendoza', 'Vargas', 'Rojas', 'Chavez'];
            const [firstName, ...rest] = firstCustomerName.split(' ');

            // Automatic tax split generation
            let autoSplits: Array<{ name: string; value: number; screenshotIds: string[] }> = [];

            if (taxSplitResult.isTaxSplit) {
              // Always auto-split when value > $200
              const totalValue = taxSplitResult.totalValue;

              // Use proper split value calculation for whole dollar amounts
              const numSplits = Math.ceil(totalValue / 199); // Keep under $200
              const baseValue = Math.floor(totalValue / numSplits);
              const remainder = totalValue - (baseValue * numSplits);

              for (let i = 0; i < numSplits; i++) {
                // Distribute remainder cents across first splits
                const splitValue = baseValue + (i < remainder ? 1 : 0);

                // Use real customer name for first split, dummy names for additional splits
                const splitName = i === 0
                  ? firstCustomerName
                  : `${firstName} ${lastNameOptions[i % lastNameOptions.length]}`;

                autoSplits.push({
                  name: splitName,
                  value: Math.round(splitValue * 100) / 100, // Round to 2 decimals
                  screenshotIds: []
                });
              }
            }

            // Combine auto-generated splits with manual splits
            const allSplits = [
              ...autoSplits,
              ...manualSplits.map(ms => ({
                name: ms.name,
                value: ms.value,
                screenshotIds: []
              }))
            ];

            return (
              <div className="space-y-4">
                {/* Tax Split Breakdown */}
                {(taxSplitResult.isTaxSplit || manualSplits.length > 0) && (
                  <div className="bg-yellow-900/20 border-2 border-yellow-600 rounded-lg p-6">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="text-3xl">⚠️</div>
                        <div className="flex-1">
                          <div className="text-yellow-300 font-bold text-lg mb-1">
                            TAX SPLIT REQUIRED
                          </div>
                          <div className="text-yellow-200 text-sm">
                            {taxSplitResult.reason || `Total value split across ${allSplits.length} different names.`}
                          </div>
                        </div>
                      </div>
                      {/* Add Manual Split Button */}
                      <button
                        onClick={() => {
                          const newSplit = {
                            id: `manual-${Date.now()}`,
                            name: `${firstName} ${lastNameOptions[allSplits.length % lastNameOptions.length]}`,
                            value: 0
                          };
                          setManualSplits(prev => [...prev, newSplit]);
                        }}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        title="Add manual split"
                      >
                        <span className="text-lg">+</span>
                        Add Split
                      </button>
                    </div>

                    {/* Split Line Items with Editable Names */}
                    <div className="space-y-3 mt-4">
                      <div className="text-white font-semibold mb-2">Split Breakdown:</div>
                      {allSplits.map((group, idx) => {
                        const splitKey = `split-${idx}`;
                        const isManual = manualSplits.some(ms => ms.name === group.name && ms.value === group.value);
                        // Use real customer name for first split, dummy names for additional splits
                        const defaultSplitName = idx === 0
                          ? firstCustomerName
                          : `${firstName} ${lastNameOptions[idx % lastNameOptions.length]}`;
                        const currentSplitName = taxSplitNames[splitKey] || group.name || defaultSplitName;

                        return (
                          <div key={idx} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="text-xs text-slate-400 mb-1">
                                  {isManual ? 'Manual Split' : `Original: ${group.name}`} → Split {idx + 1}
                                </div>
                                <input
                                  type="text"
                                  value={currentSplitName}
                                  onChange={(e) => {
                                    setTaxSplitNames(prev => ({
                                      ...prev,
                                      [splitKey]: e.target.value
                                    }));
                                  }}
                                  className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-yellow-500"
                                  placeholder="Edit split name..."
                                />
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <div className="text-xs text-slate-400">Value</div>
                                  <input
                                    type="number"
                                    value={editedSplitValues[splitKey] !== undefined ? editedSplitValues[splitKey] : group.value}
                                    onChange={(e) => {
                                      const newValue = parseFloat(e.target.value) || 0;
                                      if (isManual) {
                                        setManualSplits(prev => prev.map(ms =>
                                          ms.name === group.name ? {...ms, value: newValue} : ms
                                        ));
                                      } else {
                                        setEditedSplitValues(prev => ({
                                          ...prev,
                                          [splitKey]: newValue
                                        }));
                                      }
                                    }}
                                    className="w-24 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-yellow-400 text-lg font-bold text-center focus:outline-none focus:border-yellow-500"
                                    placeholder="0.00"
                                  />
                                  <div className="text-xs text-slate-400 mt-1">
                                    {group.screenshotIds.length} order{group.screenshotIds.length !== 1 ? 's' : ''}
                                  </div>
                                </div>
                                {isManual && (
                                  <button
                                    onClick={() => {
                                      setManualSplits(prev => prev.filter(ms => !(ms.name === group.name && ms.value === group.value)));
                                    }}
                                    className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 border border-red-700 rounded text-red-400 text-xs transition-colors"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Doc Summary - Total Weight */}
                {(() => {
                  // Calculate total weight from all items
                  const totalWeight = screenshots.reduce((docTotal, screenshot) => {
                    if (!screenshot.extractedData?.items) return docTotal;
                    const orderWeight = screenshot.extractedData.items.reduce((orderTotal, item) => {
                      return orderTotal + (item.weight || 0);
                    }, 0);
                    return docTotal + orderWeight;
                  }, 0);

                  if (totalWeight > 0) {
                    return (
                      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6 mb-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-lg font-semibold text-blue-300">⚖️ Total Doc Weight</div>
                            <div className="text-sm text-slate-400 mt-1">Sum of all item weights</div>
                          </div>
                          <div className="text-3xl font-bold text-blue-400">
                            {totalWeight.toFixed(2)} {weightUnit}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Human Review Checkbox */}
                <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                  <label className="flex items-start gap-3 cursor-pointer hover:bg-slate-800 p-3 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      id="human-review-checkbox"
                      checked={selectedDoc?.humanReviewed || false}
                      onChange={(e) => {
                        if (selectedDoc) {
                          // Update immediately without await for instant UI feedback
                          updateDoc(selectedDoc.id, {
                            humanReviewed: e.target.checked,
                            reviewedBy: e.target.checked ? currentUser?.uid : null,
                            reviewedAt: e.target.checked ? new Date() : null
                          }).catch(err => {
                            console.error('Failed to update review status:', err);
                            alert('Failed to save review status. Please try again.');
                          });
                        }
                      }}
                      className="mt-1 w-6 h-6 cursor-pointer accent-blue-600"
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium">
                        ✓ I have reviewed all information and confirm it is correct
                      </div>
                      <div className="text-slate-400 text-sm mt-1">
                        Please verify customer names, tracking numbers, quantities, prices, and all extracted data before exporting
                      </div>
                      {selectedDoc?.humanReviewed && selectedDoc?.reviewedAt && (
                        <div className="text-xs text-green-400 mt-2">
                          ✓ Reviewed on {selectedDoc.reviewedAt.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </label>
                </div>

              {/* Export Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleExportDoc}
                  disabled={!customerName || !selectedDoc?.humanReviewed}
                  className={`px-6 py-4 rounded-lg font-medium text-lg transition-all ${
                    !customerName || !selectedDoc?.humanReviewed
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed blur-sm'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                  }`}
                  title={!selectedDoc?.humanReviewed ? "Complete human review first" : "Export doc to Google Doc"}
                >
                  📄 Export to Google Doc
                </button>
                <button
                  onClick={handleExportDoc}
                  disabled={!customerName || !selectedDoc?.humanReviewed}
                  className={`px-6 py-4 rounded-lg font-medium text-lg transition-all ${
                    !customerName || !selectedDoc?.humanReviewed
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed blur-sm'
                      : 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                  }`}
                  title={!selectedDoc?.humanReviewed ? "Complete human review first" : "Export doc to Google Sheets"}
                >
                  📊 Export to Google Sheets
                </button>
              </div>

                {!selectedDoc?.humanReviewed && (
                  <div className="text-center text-yellow-400 text-sm">
                    ⚠️ Please check the verification box above to enable export
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-700 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h2 className="text-2xl font-bold text-white mb-2">No Active Doc</h2>
          <p className="text-slate-400 mb-6">
            Create a new doc to start assigning inquiries from WhatsApp or App tabs
          </p>
          <button
            onClick={createNewDoc}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            ✨ Create New Doc
          </button>
        </div>
      )}
    </div>
  );
}
