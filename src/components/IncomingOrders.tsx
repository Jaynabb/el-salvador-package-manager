import React, { useState } from 'react';

export default function IncomingOrders() {
  const [mockOrders] = useState([
    {
      id: '1',
      customerPhone: '+503 7845-1234',
      customerName: 'Maria Rodriguez',
      screenshotCount: 3,
      status: 'draft',
      lastReceived: new Date(Date.now() - 3600000), // 1 hour ago
      screenshots: [
        { id: 's1', timestamp: new Date(Date.now() - 3700000) },
        { id: 's2', timestamp: new Date(Date.now() - 3650000) },
        { id: 's3', timestamp: new Date(Date.now() - 3600000) }
      ]
    },
    {
      id: '2',
      customerPhone: '+503 6123-5678',
      customerName: 'Carlos Mendez',
      screenshotCount: 2,
      status: 'draft',
      lastReceived: new Date(Date.now() - 7200000), // 2 hours ago
      screenshots: [
        { id: 's4', timestamp: new Date(Date.now() - 7300000) },
        { id: 's5', timestamp: new Date(Date.now() - 7200000) }
      ]
    },
    {
      id: '3',
      customerPhone: '+503 7234-9876',
      customerName: null,
      screenshotCount: 1,
      status: 'waiting',
      lastReceived: new Date(Date.now() - 1800000), // 30 min ago
      screenshots: [
        { id: 's6', timestamp: new Date(Date.now() - 1800000) }
      ]
    }
  ]);

  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<{id: string, name: string} | null>(null);

  const handleProcess = (orderId: string) => {
    const order = mockOrders.find(o => o.id === orderId);
    if (!order) return;

    if (!order.customerName) {
      alert('Please set customer name before processing');
      return;
    }

    alert(
      `📦 Processing Order\n\n` +
      `Customer: ${order.customerName}\n` +
      `Screenshots: ${order.screenshotCount}\n\n` +
      `This will create a doc and extract data from all screenshots.\n\n` +
      `(Demo Mode - No actual processing)`
    );
  };

  const toggleExpand = (orderId: string) => {
    setSelectedOrder(selectedOrder === orderId ? null : orderId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-blue-100 text-blue-800';
      case 'waiting': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return '📝';
      case 'waiting': return '⏸️';
      case 'completed': return '✅';
      default: return '📱';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Draft';
      case 'waiting': return 'Waiting for Name';
      case 'completed': return 'Completed';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📱 WhatsApp Orders</h1>
            <p className="text-slate-400 mt-1">
              Screenshots received via WhatsApp - ready to process into docs
            </p>
          </div>
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            onClick={() => window.location.reload()}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div className="flex-1 text-sm text-blue-200">
            <strong className="text-blue-100">How it works:</strong> When customers send screenshots to your WhatsApp,
            they appear here automatically. Set the customer name, then process to create a doc and extract order data.
            You can also manage these in the <strong>Doc Manager</strong>.
          </div>
        </div>
      </div>

      {/* Orders List */}
      {mockOrders.length === 0 ? (
        <div className="bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-700 text-center">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-2xl font-bold text-white mb-2">No WhatsApp Orders</h2>
          <p className="text-slate-400">
            When screenshots are sent via WhatsApp, they'll appear here for processing.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {mockOrders.map(order => {
            const isExpanded = selectedOrder === order.id;

            return (
              <div
                key={order.id}
                className="bg-slate-800 rounded-lg shadow-lg overflow-hidden border border-slate-700"
              >
                {/* Order Header */}
                <div
                  className="p-6 cursor-pointer hover:bg-slate-750 transition-colors"
                  onClick={() => toggleExpand(order.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Status and Phone */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{getStatusIcon(order.status)}</span>
                        <div>
                          <div className="text-white font-medium">{order.customerPhone}</div>
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                          </span>
                        </div>
                      </div>

                      {/* Customer Name Input */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Customer Name:
                        </label>
                        <input
                          type="text"
                          value={editingName?.id === order.id ? editingName.name : (order.customerName || '')}
                          onChange={(e) => setEditingName({ id: order.id, name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Enter customer name..."
                          className="w-full max-w-md px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 text-sm text-slate-400">
                        <span>📷 {order.screenshotCount} screenshot{order.screenshotCount !== 1 ? 's' : ''}</span>
                        <span className="text-slate-500">
                          Last: {order.lastReceived.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Process Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProcess(order.id);
                      }}
                      disabled={!order.customerName && !editingName}
                      className={`ml-4 px-6 py-3 rounded-lg font-medium transition-colors ${
                        order.customerName || editingName
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      ✅ Process
                    </button>
                  </div>
                </div>

                {/* Expanded View - Screenshot Previews */}
                {isExpanded && (
                  <div className="border-t border-slate-700 bg-slate-750 p-6">
                    <h4 className="font-semibold text-white mb-4">Screenshots Preview:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {order.screenshots.map((screenshot, idx) => (
                        <div
                          key={screenshot.id}
                          className="bg-slate-800 rounded-lg p-3 border border-slate-600"
                        >
                          <div className="aspect-square bg-slate-700 rounded mb-2 flex items-center justify-center">
                            <span className="text-4xl">📱</span>
                          </div>
                          <p className="text-xs text-slate-400 text-center">
                            Screenshot {idx + 1}
                          </p>
                          <p className="text-xs text-slate-500 text-center">
                            {screenshot.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-600">
                      <p className="text-sm text-slate-300">
                        <strong className="text-white">Next Step:</strong> Click "Process" to create a doc
                        and extract order data from all screenshots using AI.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* How WhatsApp Integration Works */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h3 className="text-xl font-semibold text-white mb-4">💬 WhatsApp Integration</h3>
        <div className="space-y-3 text-slate-300 text-sm">
          <div className="flex gap-3">
            <span className="font-bold text-blue-400 min-w-[24px]">1.</span>
            <span>Customer sends you screenshots of their orders via WhatsApp</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-blue-400 min-w-[24px]">2.</span>
            <span>You forward screenshots to system WhatsApp: <strong className="text-white">+1 (415) 555-0123</strong></span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-blue-400 min-w-[24px]">3.</span>
            <span>Screenshots automatically appear here, grouped by sender</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-blue-400 min-w-[24px]">4.</span>
            <span>Enter customer name and click "Process"</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-blue-400 min-w-[24px]">5.</span>
            <span>AI extracts items, prices, tracking numbers automatically</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-blue-400 min-w-[24px]">6.</span>
            <span>System creates doc and Google Doc with all order details</span>
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-sm text-blue-200">
            <strong className="text-blue-100">⚙️ Setup:</strong> Register your phone number in{' '}
            <strong>Settings</strong> to enable WhatsApp integration. System will route messages
            from your phone to your account automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
