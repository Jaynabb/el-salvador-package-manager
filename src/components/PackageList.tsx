import React, { useState } from 'react';
import type { Package, PackageStatus } from '../types';
import { updatePackage, getPackageById } from '../services/firestoreClient';
import { formatCurrency } from '../utils/dutyCalculator';
import { sendPackageNotification } from '../services/smsService';
import { addActivityLog } from '../services/firestoreClient';
import { syncPackageToGoogleSheets } from '../services/googleSheetsService';

interface Props {
  packages: Package[];
  onPackageUpdated: () => void;
}

const PackageList: React.FC<Props> = ({ packages, onPackageUpdated }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch =
      pkg.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.customerPhone.includes(searchTerm);

    const matchesStatus = statusFilter === 'all' || pkg.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: PackageStatus) => {
    const colors = {
      'received': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      'customs-pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      'customs-cleared': 'bg-green-500/20 text-green-400 border-green-500/50',
      'ready-pickup': 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      'delivered': 'bg-slate-500/20 text-slate-400 border-slate-500/50',
      'on-hold': 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return colors[status];
  };

  const getStatusText = (status: PackageStatus) => {
    const text = {
      'received': 'Received',
      'customs-pending': 'In Customs',
      'customs-cleared': 'Customs Cleared',
      'ready-pickup': 'Ready for Pickup',
      'delivered': 'Delivered',
      'on-hold': 'On Hold'
    };
    return text[status];
  };

  const handleStatusChange = async (packageId: string, newStatus: PackageStatus) => {
    try {
      setUpdating(packageId);

      const updates: Partial<Package> = { status: newStatus };

      if (newStatus === 'customs-cleared') {
        updates.customsClearedDate = new Date();
      } else if (newStatus === 'delivered') {
        updates.deliveredDate = new Date();
        updates.paymentStatus = 'paid';
      }

      await updatePackage(packageId, updates);

      // Log activity
      await addActivityLog({
        packageId,
        action: `Status changed to ${getStatusText(newStatus)}`
      });

      // Get updated package and sync
      const pkg = packages.find(p => p.id === packageId);
      if (pkg) {
        const updatedPkg = { ...pkg, ...updates } as Package;

        // Send SMS notification
        const notificationTypes: Record<PackageStatus, any> = {
          'customs-cleared': 'customs_cleared',
          'ready-pickup': 'ready_for_pickup',
          'delivered': 'delivered',
          'received': null,
          'customs-pending': null,
          'on-hold': null
        };

        const notificationType = notificationTypes[newStatus];
        if (notificationType) {
          await sendPackageNotification(updatedPkg, notificationType);
        }

        // Sync to Google Sheets
        await syncPackageToGoogleSheets(updatedPkg);
      }

      onPackageUpdated();
    } catch (error) {
      console.error('Error updating package:', error);
      alert('Failed to update package');
    } finally {
      setUpdating(null);
    }
  };

  const handlePaymentStatusChange = async (packageId: string, paid: boolean) => {
    try {
      await updatePackage(packageId, {
        paymentStatus: paid ? 'paid' : 'pending'
      });

      await addActivityLog({
        packageId,
        action: paid ? 'Payment received' : 'Payment marked as pending'
      });

      onPackageUpdated();
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Failed to update payment status');
    }
  };

  const toggleExpanded = (packageId: string) => {
    setExpandedPackage(expandedPackage === packageId ? null : packageId);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-white">All Packages</h2>
            <p className="text-slate-400 mt-1">{filteredPackages.length} packages</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder="Search by tracking, customer name, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="received">Received</option>
            <option value="customs-pending">In Customs</option>
            <option value="customs-cleared">Customs Cleared</option>
            <option value="ready-pickup">Ready for Pickup</option>
            <option value="delivered">Delivered</option>
            <option value="on-hold">On Hold</option>
          </select>
        </div>

        {/* Package List */}
        {filteredPackages.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-6xl mb-4">📦</div>
            <p>No packages found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-slate-700/50 rounded-lg p-5 border border-slate-600 hover:border-slate-500 transition-colors"
              >
                {/* Package Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-white text-lg">{pkg.trackingNumber}</h3>
                      <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(pkg.status)}`}>
                        {getStatusText(pkg.status)}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs rounded border ${
                          pkg.paymentStatus === 'paid'
                            ? 'bg-green-500/20 text-green-400 border-green-500/50'
                            : 'bg-red-500/20 text-red-400 border-red-500/50'
                        }`}
                      >
                        {pkg.paymentStatus === 'paid' ? 'Paid' : 'Pending Payment'}
                      </span>
                    </div>

                    <div className="text-sm text-slate-300 mb-2">
                      👤 {pkg.customerName} • 📱 {pkg.customerPhone}
                      {pkg.customerEmail && ` • ✉️ ${pkg.customerEmail}`}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="text-slate-400">📍 {pkg.origin}</span>
                      {pkg.carrier && <span className="text-slate-400">🚚 {pkg.carrier}</span>}
                      <span className="text-green-400">💰 Value: {formatCurrency(pkg.totalValue)}</span>
                      <span className="text-yellow-400">📊 Fees: {formatCurrency(pkg.totalFees)}</span>
                      <span className="text-blue-400">📦 {pkg.items.length} items</span>
                      <span className="text-slate-400">📅 {pkg.receivedDate.toLocaleDateString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpanded(pkg.id)}
                    className="ml-4 text-slate-400 hover:text-white transition-colors"
                  >
                    {expandedPackage === pkg.id ? '▼' : '▶'}
                  </button>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <select
                    value={pkg.status}
                    onChange={(e) => handleStatusChange(pkg.id, e.target.value as PackageStatus)}
                    disabled={updating === pkg.id}
                    className="px-3 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm"
                  >
                    <option value="received">Received</option>
                    <option value="customs-pending">In Customs</option>
                    <option value="customs-cleared">Customs Cleared</option>
                    <option value="ready-pickup">Ready for Pickup</option>
                    <option value="delivered">Delivered</option>
                    <option value="on-hold">On Hold</option>
                  </select>

                  <button
                    onClick={() => handlePaymentStatusChange(pkg.id, pkg.paymentStatus !== 'paid')}
                    className={`px-3 py-1 rounded text-sm ${
                      pkg.paymentStatus === 'paid'
                        ? 'bg-slate-600 text-slate-300'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {pkg.paymentStatus === 'paid' ? 'Mark Unpaid' : 'Mark as Paid'}
                  </button>
                </div>

                {/* Expanded Details */}
                {expandedPackage === pkg.id && (
                  <div className="border-t border-slate-600 pt-4 mt-4 space-y-4">
                    {/* Items */}
                    <div>
                      <h4 className="font-semibold text-white mb-2">Package Items:</h4>
                      <div className="space-y-2">
                        {pkg.items.map((item, idx) => (
                          <div key={idx} className="bg-slate-800/50 rounded p-3 text-sm">
                            <div className="font-medium text-white">{item.name}</div>
                            {item.description && (
                              <div className="text-slate-400 text-xs mt-1">{item.description}</div>
                            )}
                            <div className="flex gap-3 mt-2 text-xs">
                              <span className="text-blue-400">Qty: {item.quantity}</span>
                              <span className="text-green-400">${item.unitValue} each</span>
                              <span className="text-yellow-400">Total: ${item.totalValue}</span>
                              {item.hsCode && <span className="text-purple-400">HS: {item.hsCode}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Customs Info */}
                    <div>
                      <h4 className="font-semibold text-white mb-2">Customs & Fees:</h4>
                      <div className="bg-slate-800/50 rounded p-3 text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Declared Value:</span>
                          <span className="text-white">{formatCurrency(pkg.customsDeclaration.declaredValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Import Duty:</span>
                          <span className="text-yellow-400">{formatCurrency(pkg.customsDuty)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">VAT (13%):</span>
                          <span className="text-yellow-400">{formatCurrency(pkg.vat)}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-600 pt-1 mt-1">
                          <span className="text-white font-semibold">Total Fees:</span>
                          <span className="text-green-400 font-semibold">{formatCurrency(pkg.totalFees)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {pkg.notes && (
                      <div>
                        <h4 className="font-semibold text-white mb-2">Notes:</h4>
                        <div className="bg-slate-800/50 rounded p-3 text-sm text-slate-300">
                          {pkg.notes}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageList;
