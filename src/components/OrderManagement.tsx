import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { exportOrdersToGoogleDocs, startNewGoogleDoc } from '../services/orderExportService';

export interface OrderRow {
  id: string;
  packageNumber: string;
  date: string;
  consignee: string;
  pieces: number;
  weight: string;
  trackingNumber: string;
  merchantTrackingNumber?: string; // Tracking number from merchant (Amazon, Shein, etc.)
  orderNumber?: string; // Supplier order number (fallback if no tracking)
  company: string;
  value: number;
  parcelComp: string;
  carriers?: string[]; // Array of shipping carriers (USPS, UPS, FedEx, DHL, etc.)
  customerReceivedDate?: string; // Date when customer received package (manual input)
  dateDelivered?: string; // Date when package was delivered (manual input)
  screenshotUrls: string[]; // Array of Firebase Storage URLs (one customer can have multiple screenshots)
  createdAt: Date;
}

export default function OrderManagement() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof OrderRow } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Filter state
  const [filterConsignee, setFilterConsignee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    loadOrders();
  }, [currentUser]);

  // Keyboard navigation for gallery
  useEffect(() => {
    if (!galleryOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGallery();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      } else if (e.key === 'ArrowRight') {
        nextImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryOpen, currentImageIndex, galleryImages.length]);

  const loadOrders = async () => {
    if (!currentUser?.organizationId) {
      console.warn('No organization ID available');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const ordersRef = collection(db, 'organizations', currentUser.organizationId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);

      const loadedOrders: OrderRow[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as OrderRow));

      setOrders(loadedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCellEdit = (rowId: string, field: keyof OrderRow, currentValue: any) => {
    setEditingCell({ rowId, field });
    setEditValue(String(currentValue || ''));
  };

  const handleCellSave = async () => {
    if (!editingCell || !currentUser?.organizationId) return;

    try {
      const orderRef = doc(db, 'organizations', currentUser.organizationId, 'orders', editingCell.rowId);

      // Convert value based on field type
      let value: any = editValue;
      if (editingCell.field === 'pieces' || editingCell.field === 'value') {
        value = parseFloat(editValue) || 0;
      }

      await updateDoc(orderRef, {
        [editingCell.field]: value
      });

      // Update local state
      setOrders(prev => prev.map(order =>
        order.id === editingCell.rowId
          ? { ...order, [editingCell.field]: value }
          : order
      ));

      setEditingCell(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving cell:', error);
      alert('Failed to save changes');
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const openGallery = (images: string[], startIndex: number = 0) => {
    setGalleryImages(images);
    setCurrentImageIndex(startIndex);
    setGalleryOpen(true);
  };

  const closeGallery = () => {
    setGalleryOpen(false);
    setGalleryImages([]);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % galleryImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  const handleRowSelect = (rowId: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId);
    } else {
      newSelected.add(rowId);
    }
    setSelectedRows(newSelected);
  };

  const handleSelectAll = () => {
    // Filter orders based on current filters
    const filtered = orders.filter(order => {
      if (filterConsignee && !order.consignee.toLowerCase().includes(filterConsignee.toLowerCase())) {
        return false;
      }
      if (filterDateFrom && order.date < filterDateFrom) {
        return false;
      }
      if (filterDateTo && order.date > filterDateTo) {
        return false;
      }
      return true;
    });

    if (selectedRows.size === filtered.length && filtered.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(o => o.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0 || !currentUser?.organizationId) return;

    const confirmed = confirm(`Delete ${selectedRows.size} selected row${selectedRows.size !== 1 ? 's' : ''}?`);
    if (!confirmed) return;

    try {
      for (const rowId of selectedRows) {
        const orderRef = doc(db, 'organizations', currentUser.organizationId, 'orders', rowId);
        await deleteDoc(orderRef);
      }

      setOrders(prev => prev.filter(order => !selectedRows.has(order.id)));
      setSelectedRows(new Set());
      alert(`✅ Deleted ${selectedRows.size} row${selectedRows.size !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error deleting rows:', error);
      alert('Failed to delete rows');
    }
  };

  const handleExportSelected = async () => {
    if (selectedRows.size === 0) {
      alert('Please select rows to export');
      return;
    }

    if (!currentUser?.organizationId) {
      alert('❌ Organization not configured');
      return;
    }

    const selectedOrders = orders.filter(order => selectedRows.has(order.id));

    setExporting(true);
    try {
      // Show loading message
      const exportingMessage = `Exporting ${selectedRows.size} order${selectedRows.size !== 1 ? 's' : ''} to Google Docs...`;
      console.log(exportingMessage);

      // Export to Google Docs (pass user ID for tracking)
      const result = await exportOrdersToGoogleDocs(
        selectedOrders,
        currentUser.organizationId,
        currentUser.uid // Track who exported
      );

      if (result.success && result.docUrl) {
        // Success - open the doc
        window.open(result.docUrl, '_blank');
        const action = result.isNew ? 'Created new document' : 'Appended to existing document';
        alert(`✅ Successfully exported ${selectedRows.size} order${selectedRows.size !== 1 ? 's' : ''}!\n\n${action}\n\nOpening Google Doc...`);
      } else {
        // Error
        alert(`❌ Export failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert(`❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleStartNewDoc = async () => {
    if (!currentUser?.organizationId) {
      alert('❌ Organization not configured');
      return;
    }

    const confirmed = confirm('Start a New Doc?\n\nThe next export will create a fresh Google document instead of adding to the existing one.');
    if (!confirmed) return;

    try {
      await startNewGoogleDoc(currentUser.organizationId);
      alert('✅ New document will be created on next export');
    } catch (error) {
      console.error('Error starting new doc:', error);
      alert(`❌ Failed to start new document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const renderCell = (order: OrderRow, field: keyof OrderRow) => {
    const isEditing = editingCell?.rowId === order.id && editingCell?.field === field;
    const value = order[field];

    // Skip id, createdAt, screenshotUrls, orderNumber, carriers (these aren't directly displayed in table)
    if (field === 'id' || field === 'createdAt' || field === 'screenshotUrls' || field === 'orderNumber' || field === 'carriers') return null;

    // Special handling for Date Delivered input
    if (field === 'dateDelivered') {
      if (isEditing) {
        return (
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCellSave();
              if (e.key === 'Escape') handleCellCancel();
            }}
            autoFocus
            className="w-full px-2 py-1 bg-slate-600 border border-blue-500 rounded text-white focus:outline-none"
          />
        );
      }
      return (
        <div
          onClick={() => handleCellEdit(order.id, field, value)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-600 rounded min-h-[32px]"
          title="Click to enter date"
        >
          {value || '-'}
        </div>
      );
    }

    // Special handling for Customer Received Date dropdown
    if (field === 'customerReceivedDate') {
      if (isEditing) {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCellSave();
              if (e.key === 'Escape') handleCellCancel();
            }}
            autoFocus
            className="w-full px-2 py-1 bg-slate-600 border border-blue-500 rounded text-white focus:outline-none"
          >
            <option value="">-</option>
            <option value="Yes">Yes</option>
          </select>
        );
      }
      return (
        <div
          onClick={() => handleCellEdit(order.id, field, value)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-600 rounded min-h-[32px]"
          title="Click to select"
        >
          {value || '-'}
        </div>
      );
    }

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCellSave();
            if (e.key === 'Escape') handleCellCancel();
          }}
          onBlur={handleCellSave}
          autoFocus
          className="w-full px-2 py-1 bg-slate-600 border border-blue-500 rounded text-white focus:outline-none"
        />
      );
    }

    // Special handling for merchant tracking number with fallback logic
    let displayValue: string;
    if (field === 'merchantTrackingNumber') {
      // Priority: merchantTrackingNumber → orderNumber → manual input prompt
      if (order.merchantTrackingNumber) {
        displayValue = order.merchantTrackingNumber;
      } else if (order.orderNumber) {
        displayValue = `Order #${order.orderNumber}`;
      } else {
        displayValue = '(click to enter)';
      }
    } else if (field === 'value' && value) {
      // Format value field with dollar sign
      displayValue = `$${Number(value).toFixed(2)}`;
    } else {
      displayValue = value ? String(value) : '-';
    }

    return (
      <div
        onClick={() => handleCellEdit(order.id, field, value)}
        className="px-2 py-1 cursor-pointer hover:bg-slate-600 rounded min-h-[32px]"
        title="Click to edit"
      >
        {displayValue}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-lg">Loading orders...</div>
      </div>
    );
  }

  // Apply filters
  const filteredOrders = orders.filter(order => {
    // Filter by consignee
    if (filterConsignee && !order.consignee.toLowerCase().includes(filterConsignee.toLowerCase())) {
      return false;
    }

    // Filter by date range
    if (filterDateFrom && order.date < filterDateFrom) {
      return false;
    }
    if (filterDateTo && order.date > filterDateTo) {
      return false;
    }

    return true;
  });

  // Get unique consignees for dropdown
  const uniqueConsignees = Array.from(new Set(orders.map(o => o.consignee))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-2">📊 Order Management</h1>
        <p className="text-slate-400">
          All orders are automatically populated from screenshots. Click any cell to edit.
        </p>
      </div>

      {/* Instructions - moved to top and simplified */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
        <p className="text-sm text-slate-300">
          <span className="text-blue-400 font-semibold">Quick Guide:</span> Upload screenshots → AI extracts data → Click cells to edit → Select rows to export or delete
        </p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">Filter by Consignee</label>
            <select
              value={filterConsignee}
              onChange={(e) => setFilterConsignee(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Consignees</option>
              {uniqueConsignees.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">Date From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">Date To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          {(filterConsignee || filterDateFrom || filterDateTo) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterConsignee('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
        <div className="mt-2 text-sm text-slate-400">
          Showing {filteredOrders.length} of {orders.length} orders
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
          <span className="text-slate-400 font-semibold">Legend:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-600/30 rounded"></div>
            <span className="text-slate-300">Primary manual input fields</span>
          </div>
          <div className="text-slate-400 italic">
            Note: All fields are editable by clicking on them
          </div>
        </div>
      </div>

      {/* Export Progress Banner */}
      {exporting && (
        <div className="bg-blue-600 border-2 border-blue-400 rounded-lg shadow-lg p-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
            <div className="flex-1">
              <p className="text-white font-semibold text-lg">Exporting to Google Docs...</p>
              <p className="text-blue-100 text-sm">Please wait while we format and upload your orders</p>
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-4 border border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center">
            <span className="text-white text-sm">
              {selectedRows.size > 0 ? `${selectedRows.size} row${selectedRows.size !== 1 ? 's' : ''} selected` : `${orders.length} total row${orders.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {selectedRows.size > 0 && (
              <>
                <button
                  onClick={handleExportSelected}
                  disabled={exporting}
                  className="flex-1 sm:flex-initial px-3 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {exporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="hidden sm:inline">Exporting...</span>
                      <span className="sm:hidden">Export</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">📄 Existing Doc ({selectedRows.size})</span>
                      <span className="sm:hidden">📄 Existing</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={exporting}
                  className="flex-1 sm:flex-initial px-3 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  <span className="hidden sm:inline">🗑️ Delete</span>
                  <span className="sm:hidden">🗑️</span>
                </button>
              </>
            )}
            <button
              onClick={handleStartNewDoc}
              className="flex-1 sm:flex-initial px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors whitespace-nowrap"
              title="Start a fresh Google Doc on next export"
            >
              <span className="hidden sm:inline">📝 New Doc</span>
              <span className="sm:hidden">📝 New</span>
            </button>
            <button
              onClick={loadOrders}
              className="flex-1 sm:flex-initial px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              🔄 <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === filteredOrders.length && filteredOrders.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 sm:w-4 sm:h-4 cursor-pointer"
                  />
                </th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Screenshot</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Package #</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Date</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Consignee</th>
                {/* Auto-filled fields */}
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Pieces</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Tracking Number</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Value</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Company</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Carrier</th>
                {/* Manual inputs grouped together on the right (yellow) */}
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold bg-yellow-600/30 whitespace-nowrap" title="Manual input">Weight (lb)</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold bg-yellow-600/30 whitespace-nowrap" title="Manual input">Customer Received</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold bg-yellow-600/30 whitespace-nowrap" title="Manual input">Date Delivered</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-slate-400">
                    No orders yet. Upload screenshots to automatically populate this table.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    className={`border-t border-slate-700 transition-colors ${
                      selectedRows.has(order.id) ? 'bg-blue-900/30' : 'hover:bg-slate-750'
                    }`}
                  >
                    <td className="px-2 sm:px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(order.id)}
                        onChange={() => handleRowSelect(order.id)}
                        className="w-5 h-5 sm:w-4 sm:h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-2 sm:px-4 py-2">
                      {order.screenshotUrls && order.screenshotUrls.length > 0 ? (
                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 cursor-pointer" onClick={() => openGallery(order.screenshotUrls, 0)}>
                          <img
                            src={order.screenshotUrls[0]}
                            alt={`Screenshot 1`}
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded border-2 border-slate-600 hover:border-blue-500 active:border-blue-400 transition-colors"
                            title={`${order.screenshotUrls.length} screenshot${order.screenshotUrls.length > 1 ? 's' : ''} - Tap to view gallery`}
                          />
                          {/* Count badge */}
                          {order.screenshotUrls.length > 1 && (
                            <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center border-2 border-slate-800">
                              {order.screenshotUrls.length}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-700 rounded border border-slate-600 flex items-center justify-center text-slate-500 text-xs">
                          No images
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'packageNumber')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'date')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'consignee')}</td>
                    {/* Auto-filled fields */}
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'pieces')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'merchantTrackingNumber')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'value')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'company')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'parcelComp')}</td>
                    {/* Manual inputs grouped together on the right (yellow) */}
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm bg-yellow-600/10">{renderCell(order, 'weight')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm bg-yellow-600/10">{renderCell(order, 'customerReceivedDate')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm bg-yellow-600/10">{renderCell(order, 'dateDelivered')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screenshot Gallery Modal */}
      {galleryOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-2 sm:p-4" onClick={closeGallery}>
          <div className="relative max-w-6xl w-full max-h-screen flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Close button - top right corner, mobile optimized */}
            <button
              onClick={closeGallery}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold shadow-lg z-20 transition-colors"
              title="Close (ESC)"
            >
              ✕
            </button>

            {/* Image counter - mobile optimized */}
            <div className="absolute top-2 left-2 sm:top-6 sm:left-6 bg-black/60 text-white px-2 py-1 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-lg font-semibold">
              {currentImageIndex + 1} / {galleryImages.length}
            </div>

            {/* Main image - mobile optimized */}
            <div className="flex-1 flex items-center justify-center mt-14 sm:mt-0">
              <img
                src={galleryImages[currentImageIndex]}
                alt={`Screenshot ${currentImageIndex + 1}`}
                className="max-w-full max-h-[70vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Navigation - mobile optimized */}
            {galleryImages.length > 1 && (
              <>
                {/* Previous button - smaller on mobile */}
                <button
                  onClick={prevImage}
                  className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-white p-2 sm:p-4 rounded-full transition-colors text-lg sm:text-2xl"
                  title="Previous (←)"
                >
                  ←
                </button>

                {/* Next button - smaller on mobile */}
                <button
                  onClick={nextImage}
                  className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-white p-2 sm:p-4 rounded-full transition-colors text-lg sm:text-2xl"
                  title="Next (→)"
                >
                  →
                </button>

                {/* Thumbnail strip - mobile optimized with smaller thumbnails */}
                <div className="mt-2 sm:mt-4 flex gap-1 sm:gap-2 overflow-x-auto pb-2 justify-start sm:justify-center px-2">
                  {galleryImages.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Thumbnail ${idx + 1}`}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`w-12 h-12 sm:w-20 sm:h-20 object-cover rounded cursor-pointer border-2 transition-all flex-shrink-0 ${
                        idx === currentImageIndex ? 'border-blue-500 scale-110' : 'border-slate-600 opacity-60 active:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
