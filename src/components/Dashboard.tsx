import React from 'react';
import type { DashboardStats, Package } from '../types';
import { formatCurrency } from '../utils/dutyCalculator';
import { exportPackagesToCSV } from '../services/googleSheetsService';

interface Props {
  stats: DashboardStats;
  packages: Package[];
  onRefresh: () => void;
}

const Dashboard: React.FC<Props> = ({ stats, packages, onRefresh }) => {
  const recentPackages = packages.slice(0, 10);

  const getStatusColor = (status: Package['status']) => {
    const colors = {
      'received': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      'customs-pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      'customs-cleared': 'bg-green-500/20 text-green-400 border-green-500/50',
      'ready-pickup': 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      'delivered': 'bg-slate-500/20 text-slate-400 border-slate-500/50',
      'on-hold': 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return colors[status] || colors['received'];
  };

  const getStatusText = (status: Package['status']) => {
    const text = {
      'received': 'Received',
      'customs-pending': 'In Customs',
      'customs-cleared': 'Cleared',
      'ready-pickup': 'Ready',
      'delivered': 'Delivered',
      'on-hold': 'On Hold'
    };
    return text[status] || status;
  };

  const handleExportCSV = () => {
    exportPackagesToCSV(packages);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">Dashboard</h2>
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            📊 Export to CSV
          </button>
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">Total Packages</div>
          <div className="text-3xl font-bold text-white">{stats.totalPackages}</div>
        </div>

        <div className="bg-slate-800/50 border border-blue-700/50 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">In Customs</div>
          <div className="text-3xl font-bold text-blue-400">{stats.packagesInCustoms}</div>
        </div>

        <div className="bg-slate-800/50 border border-purple-700/50 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">Ready for Pickup</div>
          <div className="text-3xl font-bold text-purple-400">{stats.packagesReadyForPickup}</div>
        </div>

        <div className="bg-slate-800/50 border border-green-700/50 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">Delivered</div>
          <div className="text-3xl font-bold text-green-400">{stats.packagesDelivered}</div>
        </div>

        <div className="bg-slate-800/50 border border-yellow-700/50 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">Total Value</div>
          <div className="text-2xl font-bold text-yellow-400">
            {formatCurrency(stats.totalValueInWarehouse)}
          </div>
          <div className="text-xs text-slate-500 mt-1">In warehouse</div>
        </div>

        <div className="bg-slate-800/50 border border-red-700/50 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">Pending Payments</div>
          <div className="text-2xl font-bold text-red-400">
            {formatCurrency(stats.pendingPayments)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Fees to collect</div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">Received Today</div>
          <div className="text-3xl font-bold text-white">{stats.packagesReceived}</div>
        </div>

        <div className="bg-slate-800/50 border border-orange-700/50 rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-1">On Hold</div>
          <div className="text-3xl font-bold text-orange-400">{stats.packagesOnHold}</div>
        </div>
      </div>

      {/* Recent Packages */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Recent Packages</h3>

        {recentPackages.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-6xl mb-4">📦</div>
            <p>No packages yet. Start by scanning a package!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-white">{pkg.trackingNumber}</h4>
                      <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(pkg.status)}`}>
                        {getStatusText(pkg.status)}
                      </span>
                      {pkg.paymentStatus === 'pending' && (
                        <span className="px-2 py-1 text-xs rounded border bg-red-500/20 text-red-400 border-red-500/50">
                          Payment Pending
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-slate-400">
                      👤 {pkg.customerName} • 📱 {pkg.customerPhone}
                    </div>

                    <div className="flex flex-wrap gap-4 mt-2 text-sm">
                      <span className="text-slate-400">
                        📍 From: {pkg.origin}
                      </span>
                      {pkg.carrier && (
                        <span className="text-slate-400">
                          🚚 {pkg.carrier}
                        </span>
                      )}
                      <span className="text-green-400">
                        💰 {formatCurrency(pkg.totalValue)}
                      </span>
                      <span className="text-yellow-400">
                        📊 Fees: {formatCurrency(pkg.totalFees)}
                      </span>
                      <span className="text-blue-400">
                        📦 {pkg.items.length} items
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-sm text-slate-400">
                    {pkg.receivedDate.toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
