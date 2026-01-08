import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDocs } from '../contexts/DocContext';
import { analyzeOrderScreenshot } from '../services/geminiService';
import type { Doc } from '../types';

interface AppInquiry {
  id: string;
  from: string;
  customerName?: string;
  type: 'image';
  imageUrl: string;
  receivedAt: Date;
  assignedToDoc?: string;
  extractedData?: {
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    trackingNumber?: string;
    orderTotal: number;
    totalPieces?: number;
    company?: string;
  };
}

export default function AppInquiries() {
  const { currentUser } = useAuth();
  const { docs, screenshots, addScreenshot } = useDocs();
  const [appInquiries, setAppInquiries] = useState<AppInquiry[]>([]);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');

  // Load real screenshots that haven't been assigned to a doc yet
  useEffect(() => {
    // Get screenshots that don't have a docId (unassigned inquiries)
    const unassignedScreenshots = screenshots.filter(s => !s.docId && s.source === 'manual');

    const inquiries: AppInquiry[] = unassignedScreenshots.map(screenshot => ({
      id: screenshot.id,
      from: 'Web App',
      customerName: screenshot.customerName || screenshot.extractedData?.customerName,
      type: 'image' as const,
      imageUrl: screenshot.imageBase64,
      receivedAt: screenshot.uploadedAt,
      extractedData: screenshot.extractedData ? {
        items: screenshot.extractedData.items || [],
        trackingNumber: screenshot.extractedData.trackingNumber,
        orderTotal: screenshot.extractedData.orderTotal || 0,
        totalPieces: screenshot.extractedData.totalPieces,
        company: screenshot.extractedData.company || screenshot.extractedData.seller
      } : undefined
    }));

    setAppInquiries(inquiries);
  }, [screenshots]);


  const handleAssignToDoc = async (inquiryId: string, docId: string) => {
    const inquiry = appInquiries.find(inq => inq.id === inquiryId);
    if (!inquiry) return;

    const targetDoc = docs.find(d => d.id === docId);

    // Handle unassignment
    if (!docId) {
      console.log(`Unassigned inquiry ${inquiryId} from doc`);
      return;
    }

    if (targetDoc) {
      try {
        console.log(`✅ Assigning app inquiry ${inquiryId} to doc: ${targetDoc.customerName}`);

        // Use context's addScreenshot function which handles everything
        const screenshotId = await addScreenshot({
          docId: targetDoc.id,
          organizationId: currentUser?.organizationId || 'test-org',
          imageBase64: inquiry.imageUrl || '',
          imageType: 'image/png',
          source: 'app-inquiry',
          extractionStatus: inquiry.extractedData ? 'completed' : 'pending',
          customerName: inquiry.customerName,
          extractedData: inquiry.extractedData
        });

        console.log(`✅ Screenshot ${screenshotId} added to doc ${targetDoc.customerName}`);

        // Remove the inquiry from the list after successful assignment
        setAppInquiries(prev => prev.filter(inq => inq.id !== inquiryId));

        alert(`✅ Inquiry assigned to doc: ${targetDoc.customerName}\n\n📷 Screenshot added successfully!`);
      } catch (error) {
        console.error('Error assigning app inquiry:', error);
        alert(`❌ Failed to assign inquiry. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleNameEdit = (customerName: string) => {
    setEditingNameId(customerName);
    setEditingNameValue(customerName || '');
  };

  const handleNameSave = (oldName: string) => {
    // Update all inquiries from this customer with the new name
    setAppInquiries(prev =>
      prev.map(inq =>
        (inq.customerName || 'Unknown') === oldName
          ? { ...inq, customerName: editingNameValue }
          : inq
      )
    );
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const handleNameCancel = () => {
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const groupedInquiries = appInquiries.reduce((acc, inq) => {
    const key = inq.customerName || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(inq);
    return acc;
  }, {} as Record<string, AppInquiry[]>);

  const unassignedCount = appInquiries.filter(inq => !inq.assignedToDoc).length;

  // Calculate total value and detect tax splits
  const totalValue = appInquiries.reduce((sum, inq) => sum + (inq.extractedData?.orderTotal || 0), 0);
  const isTaxSplit = totalValue > 200;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-2">💻 App Inquiry Submissions</h1>
        <p className="text-slate-400">
          Inquiries uploaded via the Upload tab - assign them to docs below
        </p>
        <div className="mt-4 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-blue-400 text-sm">
            💡 <strong>New Upload?</strong> Use the <strong>Upload</strong> tab to add screenshots with customer name grouping
          </p>
        </div>
        {docs.length === 0 && (
          <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
            <p className="text-yellow-400 text-sm">
              ⚠️ No docs available. Create a doc in the <strong>Doc Manager</strong> tab first, then return here to assign inquiries.
            </p>
          </div>
        )}
      </div>

      {/* Incoming Inquiries */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Incoming Inquiries</h2>
            <p className="text-sm text-slate-400 mt-1">
              {unassignedCount} unassigned inquir{unassignedCount !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>

        {/* Inquiries grouped by customer */}
        <div className="space-y-4">
          {Object.entries(groupedInquiries).map(([customerName, inquiries]) => {
            const customerInquiries = inquiries;

            // Calculate customer's total value
            const customerTotal = customerInquiries.reduce((sum, inq) =>
              sum + (inq.extractedData?.orderTotal || 0), 0
            );
            const needsTaxSplit = customerTotal > 200;

            return (
              <div
                key={customerName}
                className={`bg-slate-700 rounded-lg border overflow-hidden ${
                  needsTaxSplit ? 'border-yellow-500' : 'border-slate-600'
                }`}
              >
                {/* Customer Header */}
                <div className={`p-4 border-b ${needsTaxSplit ? 'border-yellow-500/30 bg-yellow-900/10' : 'border-slate-600'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {editingNameId === customerName ? (
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            className="px-3 py-1.5 bg-slate-700 border border-blue-500 rounded text-white text-lg font-semibold focus:outline-none focus:border-blue-400"
                            placeholder="Enter customer name"
                            autoFocus
                          />
                          <button
                            onClick={() => handleNameSave(customerName)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                          >
                            ✓ Save
                          </button>
                          <button
                            onClick={handleNameCancel}
                            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm transition-colors"
                          >
                            ✕ Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-white font-semibold text-lg">{customerName}</div>
                          <button
                            onClick={() => handleNameEdit(customerName)}
                            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                            title="Click to edit customer name"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      )}
                      <div className="text-slate-300 text-sm">Web App Upload</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {customerInquiries.length} inquir{customerInquiries.length !== 1 ? 'ies' : 'y'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${needsTaxSplit ? 'text-yellow-400' : 'text-white'}`}>
                        ${customerTotal.toFixed(2)}
                      </div>
                      {needsTaxSplit && (
                        <div className="mt-1 px-2 py-1 bg-yellow-900/30 border border-yellow-600 rounded text-yellow-400 text-xs font-medium">
                          ⚠️ Tax Split Needed
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inquiries */}
                <div className="p-4 space-y-3">
                  {customerInquiries.map((inq) => (
                    <div
                      key={inq.id}
                      className="p-4 rounded-lg bg-slate-600 border border-slate-500"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">📷</span>
                            <span className="text-slate-300 text-sm">Screenshot Upload</span>
                            <span className="text-slate-500 text-xs">
                              {inq.receivedAt.toLocaleTimeString()}
                            </span>
                          </div>

                          {inq.extractedData && (
                            <div className="ml-8 mt-2 p-3 bg-slate-700 rounded border border-slate-600">
                              <div className="text-xs text-slate-400 mb-2">AI Extracted Data:</div>
                              <div className="text-sm text-white space-y-1">
                                <div>💰 Total: ${inq.extractedData.orderTotal.toFixed(2)}</div>
                                {inq.extractedData.totalPieces && (
                                  <div>📦 {inq.extractedData.totalPieces} piece{inq.extractedData.totalPieces !== 1 ? 's' : ''}</div>
                                )}
                                {inq.extractedData.company && (
                                  <div>🏢 {inq.extractedData.company}</div>
                                )}
                                {inq.extractedData.trackingNumber && (
                                  <div className="text-xs text-slate-400">📍 {inq.extractedData.trackingNumber}</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Doc Assignment Section */}
                        <div className="flex-shrink-0 w-72">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Assign to Doc:</label>
                            <select
                              value=""
                              onChange={(e) => handleAssignToDoc(inq.id, e.target.value)}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                              disabled={docs.length === 0}
                            >
                              <option value="">Select a doc...</option>
                              {docs.map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                  {doc.customerName || 'Unnamed Doc'} ({doc.screenshotCount} items)
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 text-xs text-blue-400">
                              💡 Inquiry will be removed after assignment
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {appInquiries.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-6xl mb-4">📭</div>
            <p>No app inquiries yet. Upload screenshots above to get started...</p>
          </div>
        )}
      </div>
    </div>
  );
}
