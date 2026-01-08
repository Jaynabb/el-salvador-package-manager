import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDocs } from '../contexts/DocContext';
import type { Doc } from '../types';

interface IncomingMessage {
  id: string;
  from: string;
  customerName?: string;
  type: 'text' | 'image';
  content?: string;
  imageUrl?: string;
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
  };
}

export default function WhatsAppInquiries() {
  console.log('📱 WhatsAppInquiries component loading...');

  const { currentUser } = useAuth();
  const { docs, addScreenshot } = useDocs();
  const [incomingMessages, setIncomingMessages] = useState<IncomingMessage[]>([]);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');

  console.log('📱 WhatsAppInquiries rendering...', { currentUser, docs: docs.length, messages: incomingMessages.length });

  // Mock messages
  useEffect(() => {
    console.log('📱 Loading mock messages...', { currentUser });

    const mockMessages: IncomingMessage[] = [
      {
        id: 'msg-1',
        from: '+503 7845-1234',
        customerName: 'Maria Rodriguez',
        type: 'image',
        imageUrl: 'https://via.placeholder.com/300x400?text=Order+Screenshot+1',
        receivedAt: new Date(Date.now() - 5 * 60000),
        extractedData: {
          items: [
            { name: 'Wireless Keyboard', quantity: 1, unitPrice: 79.99, total: 79.99 },
            { name: 'USB-C Cable', quantity: 2, unitPrice: 19.99, total: 39.98 }
          ],
          trackingNumber: '1Z999AA10123456784',
          orderTotal: 119.97
        }
      },
      {
        id: 'msg-2',
        from: '+503 7845-1234',
        customerName: 'Maria Rodriguez',
        type: 'image',
        imageUrl: 'https://via.placeholder.com/300x400?text=Order+Screenshot+2',
        receivedAt: new Date(Date.now() - 3 * 60000),
        extractedData: {
          items: [
            { name: 'Nike Air Max', quantity: 2, unitPrice: 120.00, total: 240.00 }
          ],
          trackingNumber: '1Z999BB20234567895',
          orderTotal: 240.00
        }
      },
      {
        id: 'msg-3',
        from: '+503 7912-5678',
        customerName: 'Carlos Mendez',
        type: 'image',
        imageUrl: 'https://via.placeholder.com/300x400?text=Order+Screenshot+3',
        receivedAt: new Date(Date.now() - 10 * 60000),
        extractedData: {
          items: [
            { name: 'Bluetooth Speaker', quantity: 1, unitPrice: 159.99, total: 159.99 }
          ],
          trackingNumber: '1Z999CC30456789012',
          orderTotal: 159.99
        }
      },
      {
        id: 'msg-4',
        from: '+503 7823-9876',
        customerName: 'Ana Garcia',
        type: 'text',
        content: 'Hola, quiero saber sobre mi paquete',
        receivedAt: new Date(Date.now() - 15 * 60000)
      }
    ];

    setIncomingMessages(mockMessages);
    console.log('📱 Mock messages loaded!', { docs: docs.length, messages: mockMessages.length });
  }, [currentUser, docs]);

  const handleAssignToDoc = async (messageId: string, docId: string) => {
    const message = incomingMessages.find(m => m.id === messageId);
    if (!message) return;

    const targetDoc = docs.find(d => d.id === docId);

    // Handle unassignment
    if (!docId) {
      console.log(`Unassigned message ${messageId} from doc`);
      return;
    }

    if (targetDoc) {
      try {
        console.log(`✅ Assigning WhatsApp message ${messageId} to doc: ${targetDoc.customerName}`);

        // Use context's addScreenshot function which handles everything
        const screenshotId = await addScreenshot({
          docId: targetDoc.id,
          organizationId: currentUser?.organizationId || 'test-org',
          imageBase64: message.imageUrl || '',
          imageType: 'image/png',
          source: 'whatsapp',
          extractionStatus: message.extractedData ? 'completed' : 'pending',
          customerName: message.customerName,
          phoneNumber: message.from,
          extractedData: message.extractedData
        });

        console.log(`✅ Screenshot ${screenshotId} added to doc ${targetDoc.customerName}`);

        // Remove the inquiry from the list after successful assignment
        setIncomingMessages(prev => prev.filter(msg => msg.id !== messageId));

        alert(`✅ Inquiry assigned to doc: ${targetDoc.customerName}\n\n📷 Screenshot added to doc successfully!`);
      } catch (error) {
        console.error('Error assigning WhatsApp inquiry:', error);
        console.error('Error details:', error);
        alert(`❌ Failed to assign inquiry. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleNameEdit = (phone: string, currentName?: string) => {
    setEditingNameId(phone);
    setEditingNameValue(currentName || '');
  };

  const handleNameSave = (phone: string) => {
    // Update all messages from this sender with the new name
    setIncomingMessages(prev =>
      prev.map(msg =>
        msg.from === phone
          ? { ...msg, customerName: editingNameValue }
          : msg
      )
    );
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const handleNameCancel = () => {
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const groupedMessages = incomingMessages.reduce((acc, msg) => {
    const key = msg.from;
    if (!acc[key]) acc[key] = [];
    acc[key].push(msg);
    return acc;
  }, {} as Record<string, IncomingMessage[]>);

  const unassignedCount = incomingMessages.filter(m => !m.assignedToDoc).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-2">📱 WhatsApp Inquiries</h1>
        <p className="text-slate-400">
          Receive WhatsApp inquiries and assign to docs - All docs managed in Doc Manager
        </p>
        {docs.length === 0 && (
          <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
            <p className="text-yellow-400 text-sm">
              ⚠️ No docs available. Create a doc in the <strong>Doc Manager</strong> tab first, then return here to assign messages.
            </p>
          </div>
        )}
      </div>

      {/* Incoming Messages */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Incoming Messages</h2>
            <p className="text-sm text-slate-400 mt-1">
              {unassignedCount} unassigned message{unassignedCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Messages grouped by sender */}
        <div className="space-y-4">
          {Object.entries(groupedMessages).map(([phone, messages]) => {
            const senderMessages = messages;

            // Calculate sender's total value from image messages with extracted data
            const senderTotal = senderMessages.reduce((sum, msg) =>
              sum + (msg.extractedData?.orderTotal || 0), 0
            );
            const needsTaxSplit = senderTotal > 200;

            return (
              <div
                key={phone}
                className={`bg-slate-700 rounded-lg border overflow-hidden ${
                  needsTaxSplit ? 'border-yellow-500' : 'border-slate-600'
                }`}
              >
                {/* Sender Header */}
                <div className={`p-4 border-b ${needsTaxSplit ? 'border-yellow-500/30 bg-yellow-900/10' : 'border-slate-600'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {editingNameId === phone ? (
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
                            onClick={() => handleNameSave(phone)}
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
                          <div className="text-white font-semibold text-lg">
                            {senderMessages[0]?.customerName || 'Unknown'}
                          </div>
                          <button
                            onClick={() => handleNameEdit(phone, senderMessages[0]?.customerName)}
                            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                            title="Click to edit customer name"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      )}
                      <div className="text-slate-300 text-sm">{phone}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {senderMessages.length} message{senderMessages.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      {senderTotal > 0 && (
                        <>
                          <div className={`text-lg font-bold ${needsTaxSplit ? 'text-yellow-400' : 'text-white'}`}>
                            ${senderTotal.toFixed(2)}
                          </div>
                          {needsTaxSplit && (
                            <div className="mt-1 px-2 py-1 bg-yellow-900/30 border border-yellow-600 rounded text-yellow-400 text-xs font-medium">
                              ⚠️ Tax Split Needed
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-3">
                  {senderMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-lg bg-slate-600 border border-slate-500"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">
                              {msg.type === 'image' ? '📷' : '💬'}
                            </span>
                            <span className="text-slate-300 text-sm">
                              {msg.type === 'image' ? 'Screenshot' : 'Text Message'}
                            </span>
                            <span className="text-slate-500 text-xs">
                              {msg.receivedAt.toLocaleTimeString()}
                            </span>
                          </div>

                          {msg.type === 'text' && msg.content && (
                            <div className="text-white ml-8 mb-2">"{msg.content}"</div>
                          )}

                          {msg.extractedData && (
                            <div className="ml-8 mt-2 p-3 bg-slate-700 rounded border border-slate-600">
                              <div className="text-xs text-slate-400 mb-2">AI Extracted Data:</div>
                              <div className="text-sm text-white space-y-1">
                                <div>💰 Total: ${msg.extractedData.orderTotal.toFixed(2)}</div>
                                {msg.extractedData.trackingNumber && (
                                  <div>📦 Tracking: {msg.extractedData.trackingNumber}</div>
                                )}
                                <div className="text-slate-300">
                                  {msg.extractedData.items.length} item{msg.extractedData.items.length !== 1 ? 's' : ''}
                                </div>
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
                              onChange={(e) => handleAssignToDoc(msg.id, e.target.value)}
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

        {incomingMessages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-6xl mb-4">📭</div>
            <p>No incoming messages yet. Waiting for WhatsApp inquiries...</p>
          </div>
        )}
      </div>
    </div>
  );
}
