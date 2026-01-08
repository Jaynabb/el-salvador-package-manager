import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDocs } from '../contexts/DocContext';
import { db } from '../services/firebase';
import {
  collection,
  doc as firebaseDoc,
  updateDoc as firebaseUpdateDoc,
  addDoc as firebaseAddDoc,
  deleteDoc as firebaseDeleteDoc,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import type { Doc, Screenshot, Importer } from '../types';
import { analyzeOrderScreenshot } from '../services/geminiService';
import { completeMVPExport } from '../services/mvpExportService';
import { getNextPackageNumber } from '../services/packageNumbering';

const CURRENT_IMPORTER_ID = 'default';

interface TaxSplit {
  id: string;
  name: string;
  screenshots: Screenshot[];
  total: number;
}

export default function DocManagerV2() {
  const { currentUser } = useAuth();
  const { docs, screenshots: allScreenshots, addDoc, updateDoc, deleteDoc } = useDocs();
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [taxSplits, setTaxSplits] = useState<TaxSplit[]>([]);
  const [humanVerified, setHumanVerified] = useState(false);
  const [importer, setImporter] = useState<Importer | null>(null);
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
  const [editingSplitName, setEditingSplitName] = useState<string>('');
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);

  // Load importer data
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

  // Get screenshots for selected doc
  const screenshots = selectedDoc
    ? allScreenshots.filter(s => s.docId === selectedDoc.id)
    : [];

  // Auto-generate tax splits when total > $200
  useEffect(() => {
    if (!screenshots.length) {
      setTaxSplits([]);
      return;
    }

    const total = screenshots.reduce((sum, s) => sum + (s.extractedData?.orderTotal || 0), 0);

    if (total > 200) {
      // Group by customer name
      const groups: { [key: string]: Screenshot[] } = {};
      screenshots.forEach(s => {
        const name = s.extractedData?.customerName || s.customerName || 'Unknown';
        if (!groups[name]) groups[name] = [];
        groups[name].push(s);
      });

      const splits: TaxSplit[] = Object.entries(groups).map(([name, screens], idx) => ({
        id: `split-${idx}`,
        name: name,
        screenshots: screens,
        total: screens.reduce((sum, s) => sum + (s.extractedData?.orderTotal || 0), 0)
      }));

      setTaxSplits(splits);
    } else {
      // Single group
      setTaxSplits([{
        id: 'main',
        name: customerName || 'Main Package',
        screenshots: screenshots,
        total: total
      }]);
    }
  }, [screenshots, customerName]);

  // Select first doc by default
  useEffect(() => {
    if (docs.length > 0 && !selectedDoc) {
      setSelectedDoc(docs[0]);
      setCustomerName(docs[0].customerName || '');
      setWeight(docs[0].weight?.toString() || '');
      setWeightUnit(docs[0].weightUnit || 'kg');
      setHumanVerified(docs[0].humanReviewed || false);
    }
  }, [docs, selectedDoc]);

  const createNewDoc = async () => {
    const orgId = currentUser?.organizationId || 'test-org';
    const { packageNumber, sequenceNumber } = await getNextPackageNumber(orgId);

    const docId = await addDoc({
      importerId: CURRENT_IMPORTER_ID,
      organizationId: orgId,
      customerName: 'New Inquiry',
      screenshotIds: [],
      screenshotCount: 0,
      status: 'draft',
      hasWhatsAppScreenshots: false,
      hasManualScreenshots: true,
      packageNumber,
      sequenceNumber,
      dateArrived: new Date(),
      humanReviewed: false
    });

    const newDoc = docs.find(b => b.id === docId);
    if (newDoc) {
      setSelectedDoc(newDoc);
      setCustomerName('');
      setWeight('');
      setHumanVerified(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!selectedDoc) {
      await createNewDoc();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const currentDoc = selectedDoc;
    if (!currentDoc) return;

    setUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await fileToBase64(file);

        const screenshotRef = await firebaseAddDoc(collection(db!, 'screenshots'), {
          docId: currentDoc.id,
          imageBase64: base64,
          imageType: file.type,
          source: 'manual',
          extractionStatus: 'pending',
          importerId: CURRENT_IMPORTER_ID,
          uploadedAt: Timestamp.fromDate(new Date())
        });

        // Extract with AI
        processScreenshot(screenshotRef.id, base64);
      }

      await updateDoc(currentDoc.id, {
        screenshotCount: (currentDoc.screenshotCount || 0) + files.length,
        hasManualScreenshots: true
      });
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Failed to upload screenshots');
    } finally {
      setUploading(false);
    }
  };

  const processScreenshot = async (screenshotId: string, base64: string) => {
    try {
      const extractedData = await analyzeOrderScreenshot(base64);
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        extractedData,
        extractionStatus: 'completed',
        processedAt: Timestamp.fromDate(new Date())
      });
    } catch (error) {
      console.error('AI extraction error:', error);
      await firebaseUpdateDoc(firebaseDoc(db!, 'screenshots', screenshotId), {
        extractionStatus: 'error',
        extractionError: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeScreenshot = async (screenshotId: string) => {
    if (!confirm('Remove this screenshot?')) return;
    try {
      await firebaseDeleteDoc(firebaseDoc(db!, 'screenshots', screenshotId));
      if (selectedDoc) {
        await updateDoc(selectedDoc.id, {
          screenshotCount: Math.max(0, (selectedDoc.screenshotCount || 1) - 1)
        });
      }
    } catch (error) {
      console.error('Error removing screenshot:', error);
    }
  };

  const moveScreenshot = async (screenshotId: string, fromSplitId: string, toSplitId: string) => {
    // This will be handled by tax split name updates in the screenshot
    // For now, just update the customer name in extracted data
    const screenshot = screenshots.find(s => s.id === screenshotId);
    const toSplit = taxSplits.find(s => s.id === toSplitId);

    if (screenshot && toSplit && db) {
      await firebaseUpdateDoc(firebaseDoc(db, 'screenshots', screenshotId), {
        customerName: toSplit.name,
        extractedData: {
          ...screenshot.extractedData,
          customerName: toSplit.name
        }
      });
    }
  };

  const handleEditSplitName = (splitId: string, currentName: string) => {
    setEditingSplitId(splitId);
    setEditingSplitName(currentName);
  };

  const handleSaveSplitName = async (splitId: string) => {
    if (!db || !editingSplitName.trim()) return;

    // Update all screenshots in this split with the new customer name
    const split = taxSplits.find(s => s.id === splitId);
    if (split) {
      for (const screenshot of split.screenshots) {
        await firebaseUpdateDoc(firebaseDoc(db, 'screenshots', screenshot.id), {
          customerName: editingSplitName,
          extractedData: {
            ...screenshot.extractedData,
            customerName: editingSplitName
          }
        });
      }
    }

    setEditingSplitId(null);
    setEditingSplitName('');
  };

  const handleCancelSplitEdit = () => {
    setEditingSplitId(null);
    setEditingSplitName('');
  };

  const handleExport = async () => {
    if (!selectedDoc || !humanVerified) return;

    setExporting(true);
    try {
      const result = await completeMVPExport(selectedDoc, screenshots, importer || undefined);

      if (result.success) {
        alert(`✅ Export successful!\n\n${result.docUrl ? `Doc: ${result.docUrl}\n` : ''}${result.sheetUrl ? `Sheet: ${result.sheetUrl}` : ''}`);

        // Mark as completed
        await updateDoc(selectedDoc.id, {
          status: 'completed',
          googleDocUrl: result.docUrl,
          googleSheetUrl: result.sheetUrl
        });
      } else {
        alert(`❌ Export failed:\n${result.errors.join('\n')}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const updateCustomerName = async (name: string) => {
    setCustomerName(name);
    if (selectedDoc) {
      await updateDoc(selectedDoc.id, { customerName: name });
    }
  };

  const updateWeight = async (val: string) => {
    setWeight(val);
    if (selectedDoc) {
      await updateDoc(selectedDoc.id, { weight: parseFloat(val) || 0 });
    }
  };

  const updateWeightUnit = async (unit: 'kg' | 'lb') => {
    setWeightUnit(unit);
    if (selectedDoc) {
      await updateDoc(selectedDoc.id, { weightUnit: unit });
    }
  };

  const toggleHumanVerification = async (checked: boolean) => {
    setHumanVerified(checked);
    if (selectedDoc) {
      await updateDoc(selectedDoc.id, {
        humanReviewed: checked,
        reviewedBy: checked ? currentUser?.uid : null,
        reviewedAt: checked ? new Date() : null
      });
    }
  };

  const totalValue = screenshots.reduce((sum, s) => sum + (s.extractedData?.orderTotal || 0), 0);
  const totalPieces = screenshots.reduce((sum, s) => sum + (s.extractedData?.totalPieces || 0), 0);
  const needsTaxSplit = totalValue > 200;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header: Inquiry Selector & New Button */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <select
            value={selectedDoc?.id || ''}
            onChange={(e) => {
              const doc = docs.find(d => d.id === e.target.value);
              if (doc) {
                setSelectedDoc(doc);
                setCustomerName(doc.customerName || '');
                setWeight(doc.weight?.toString() || '');
                setWeightUnit(doc.weightUnit || 'kg');
                setHumanVerified(doc.humanReviewed || false);
              }
            }}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
          >
            {docs.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.packageNumber || doc.id} - {doc.customerName || 'Unnamed'} ({doc.screenshotCount || 0} screenshots)
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={createNewDoc}
          className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          + New Inquiry
        </button>
      </div>

      {selectedDoc && (
        <>
          {/* Basic Info */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                ✏️ Customer Name (Editable)
                <span className="text-xs text-blue-400 font-normal">← Click to edit</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => updateCustomerName(e.target.value)}
                placeholder="👆 Click here to enter customer name..."
                className="w-full px-4 py-2 bg-slate-700 border-2 border-blue-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50"
              />
              <p className="text-xs text-slate-400 mt-1">💡 Tip: Edit the customer name here and it will sync to the selected doc</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Weight</label>
              <input
                type="number"
                value={weight}
                onChange={(e) => updateWeight(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Unit</label>
              <select
                value={weightUnit}
                onChange={(e) => updateWeightUnit(e.target.value as 'kg' | 'lb')}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>
          </div>

          {/* Upload Zone */}
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
              id="file-upload"
              disabled={uploading}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-4xl mb-2">📸</div>
              <div className="text-white font-medium mb-1">
                {uploading ? 'Uploading & Analyzing...' : 'Click to Upload Screenshots'}
              </div>
              <div className="text-sm text-slate-400">
                AI will automatically extract order details
              </div>
            </label>
          </div>

          {/* Summary Stats */}
          {screenshots.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Screenshots</div>
                <div className="text-2xl font-bold text-white">{screenshots.length}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Total Pieces</div>
                <div className="text-2xl font-bold text-white">{totalPieces}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Total Value</div>
                <div className="text-2xl font-bold text-white">${totalValue.toFixed(2)}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Status</div>
                <div className={`text-lg font-bold ${needsTaxSplit ? 'text-yellow-400' : 'text-green-400'}`}>
                  {needsTaxSplit ? '⚠️ Tax Split' : '✓ Normal'}
                </div>
              </div>
            </div>
          )}

          {/* Tax Splits / Groups */}
          {taxSplits.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">
                {needsTaxSplit ? `📦 Tax Splits (${taxSplits.length} groups)` : '📦 Package Items'}
              </h3>

              {taxSplits.map((split) => (
                <div key={split.id} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                  <div className="bg-slate-700 px-4 py-3 flex items-center justify-between">
                    {editingSplitId === split.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingSplitName}
                          onChange={(e) => setEditingSplitName(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-slate-600 border border-blue-500 rounded text-white text-sm focus:outline-none focus:border-blue-400"
                          placeholder="Customer name..."
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveSplitName(split.id)}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors"
                        >
                          ✓ Save
                        </button>
                        <button
                          onClick={handleCancelSplitEdit}
                          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs transition-colors"
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="font-medium text-white">{split.name}</div>
                        <button
                          onClick={() => handleEditSplitName(split.id, split.name)}
                          className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                          title="Click to edit customer name"
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="text-slate-400">{split.screenshots.length} items • </span>
                      <span className="text-white font-semibold">${split.total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {split.screenshots.map((screenshot) => (
                      <div key={screenshot.id} className="bg-slate-700/50 rounded-lg p-3 flex gap-3">
                        <div className="relative group">
                          <img
                            src={screenshot.imageBase64}
                            alt="Order"
                            className="w-32 h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setViewingScreenshot(screenshot.imageBase64)}
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                              🔍 Click to view
                            </div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium mb-1">
                            {screenshot.extractedData?.seller || 'Processing...'}
                          </div>
                          <div className="text-xs text-slate-400 mb-1">
                            Customer: {screenshot.customerName || screenshot.extractedData?.customerName || 'Unknown'}
                          </div>
                          <div className="text-sm text-slate-300 mb-2">
                            {screenshot.extractedData?.items?.map(item =>
                              `${item.name} (x${item.quantity})`
                            ).join(', ') || 'No items extracted'}
                          </div>
                          <div className="flex gap-3 text-xs">
                            <div className="text-green-400">
                              💰 ${screenshot.extractedData?.orderTotal?.toFixed(2) || '0.00'}
                            </div>
                            {screenshot.extractedData?.trackingNumber && (
                              <div className="text-blue-400">
                                📦 {screenshot.extractedData.trackingNumber}
                              </div>
                            )}
                            {screenshot.extractedData?.totalPieces && (
                              <div className="text-yellow-400">
                                📊 {screenshot.extractedData.totalPieces} pieces
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {taxSplits.length > 1 && (
                            <select
                              value={split.id}
                              onChange={(e) => moveScreenshot(screenshot.id, split.id, e.target.value)}
                              className="text-xs px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white"
                            >
                              {taxSplits.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={() => removeScreenshot(screenshot.id)}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scroll indicator if user needs to review */}
          {screenshots.length > 3 && !humanVerified && (
            <div className="text-center text-sm text-slate-400 animate-bounce">
              ↓ Scroll down to review all items and verify ↓
            </div>
          )}

          {/* Human Verification & Export - At Bottom */}
          {screenshots.length > 0 && (
            <div className="border-t-2 border-slate-700 pt-6 mt-8 space-y-4">
              <label className="flex items-center gap-3 p-4 bg-slate-800 rounded-lg border-2 border-yellow-500 cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={humanVerified}
                  onChange={(e) => toggleHumanVerification(e.target.checked)}
                  className="w-5 h-5 rounded border-yellow-500 text-yellow-600"
                />
                <div>
                  <div className="text-white font-medium">✓ I have verified all information is correct</div>
                  <div className="text-sm text-slate-400">Check this box to enable export</div>
                </div>
              </label>

              <div className="flex gap-4">
                <button
                  onClick={handleExport}
                  disabled={!humanVerified || exporting}
                  className={`flex-1 px-6 py-4 rounded-lg font-medium text-lg transition-all ${
                    humanVerified
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed blur-sm'
                  }`}
                >
                  {exporting ? '⏳ Exporting...' : '📄 Export to Google Doc & Sheet'}
                </button>
              </div>

              {!humanVerified && (
                <div className="text-center text-sm text-yellow-400">
                  ⚠️ Please verify all information above before exporting
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Full-Screen Screenshot Viewer Modal */}
      {viewingScreenshot && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewingScreenshot(null)}
        >
          <div className="max-w-6xl max-h-[90vh] relative">
            <button
              onClick={() => setViewingScreenshot(null)}
              className="absolute -top-12 right-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              ✕ Close
            </button>
            <img
              src={viewingScreenshot}
              alt="Full screenshot"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="text-center text-white text-sm mt-4">
              Click outside image to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
