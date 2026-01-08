import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Organization, User } from '../types';
import type { OrderRow } from './OrderManagement';

interface ExportHistoryRecord {
  id: string;
  docId: string;
  docUrl: string;
  organizationId: string;
  organizationName: string;
  orderCount: number;
  customerNames: string[];
  packageNumbers: string[];
  screenshotUrls: string[];
  totalValue: number;
  exportedBy: string;
  exportedAt: Date;
  isNewDoc: boolean;
}

interface OrganizationStats {
  id: string;
  organizationName: string;
  totalOrders: number;
  totalExports: number;
  totalValue: number;
  memberCount: number;
  googleConnected: boolean;
  lastExport?: Date;
  status: string;
}

export default function MasterAdminDashboard() {
  const { currentUser, isMasterAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'exports' | 'search'>('overview');

  // Overview data
  const [orgStats, setOrgStats] = useState<OrganizationStats[]>([]);
  const [totalStats, setTotalStats] = useState({
    totalOrganizations: 0,
    totalUsers: 0,
    totalOrders: 0,
    totalExports: 0,
    totalValue: 0,
  });

  // Export history
  const [exportHistory, setExportHistory] = useState<ExportHistoryRecord[]>([]);
  const [selectedExport, setSelectedExport] = useState<ExportHistoryRecord | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExportHistoryRecord[]>([]);

  useEffect(() => {
    if (isMasterAdmin) {
      loadDashboardData();
    }
  }, [isMasterAdmin]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load all organizations
      const orgsSnapshot = await getDocs(collection(db, 'organizations'));
      const organizations = orgsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Organization[];

      // Load all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];

      // Load export history (last 100 exports) - handle if collection doesn't exist
      let exports: ExportHistoryRecord[] = [];
      try {
        const exportsQuery = query(
          collection(db, 'exportHistory'),
          orderBy('exportedAt', 'desc'),
          limit(100)
        );
        const exportsSnapshot = await getDocs(exportsQuery);
        exports = exportsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          exportedAt: doc.data().exportedAt?.toDate() || new Date(),
        })) as ExportHistoryRecord[];
      } catch (exportError) {
        console.warn('No export history yet or index missing:', exportError);
        // Continue without export history - it's ok if there are no exports yet
      }

      setExportHistory(exports);

      // Calculate organization stats
      const stats: OrganizationStats[] = [];
      let totalOrderCount = 0;
      let totalExportCount = 0;
      let totalValueSum = 0;

      for (const org of organizations) {
        // Get orders for this org
        const ordersSnapshot = await getDocs(
          collection(db, 'organizations', org.id, 'orders')
        );
        const orderCount = ordersSnapshot.size;
        const orders = ordersSnapshot.docs.map(doc => doc.data()) as OrderRow[];
        const orgTotalValue = orders.reduce((sum, order) => sum + (order.value || 0), 0);

        // Get exports for this org
        const orgExports = exports.filter(exp => exp.organizationId === org.id);
        const lastExport = orgExports.length > 0 ? orgExports[0].exportedAt : undefined;

        // Get member count
        const orgUsers = users.filter(u => u.organizationId === org.id);

        stats.push({
          id: org.id,
          organizationName: org.organizationName,
          totalOrders: orderCount,
          totalExports: orgExports.length,
          totalValue: orgTotalValue,
          memberCount: orgUsers.length,
          googleConnected: org.googleConnected || false,
          lastExport,
          status: org.status,
        });

        totalOrderCount += orderCount;
        totalExportCount += orgExports.length;
        totalValueSum += orgTotalValue;
      }

      setOrgStats(stats);
      setTotalStats({
        totalOrganizations: organizations.length,
        totalUsers: users.length,
        totalOrders: totalOrderCount,
        totalExports: exports.length,
        totalValue: totalValueSum,
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);

      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to load dashboard data: ${errorMessage}\n\nPlease check browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = exportHistory.filter(exp =>
      exp.customerNames.some(name => name.toLowerCase().includes(query)) ||
      exp.organizationName.toLowerCase().includes(query) ||
      exp.packageNumbers.some(pkg => pkg.toLowerCase().includes(query))
    );

    setSearchResults(results);
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isMasterAdmin) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 text-lg">Access Denied</div>
        <div className="text-slate-400 text-sm mt-2">Master Admin access required</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-2">👑 Master Admin Dashboard</h1>
        <p className="text-slate-400">
          System-wide monitoring and document retrieval
        </p>
      </div>

      {/* Summary Stats */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">📊 Platform Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-slate-800/50 border border-purple-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Organizations</div>
            <div className="text-2xl md:text-3xl font-bold text-purple-400">{totalStats.totalOrganizations}</div>
            <div className="text-xs text-slate-500 mt-1">Active clients</div>
          </div>

          <div className="bg-slate-800/50 border border-blue-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Users</div>
            <div className="text-2xl md:text-3xl font-bold text-blue-400">{totalStats.totalUsers}</div>
            <div className="text-xs text-slate-500 mt-1">All members</div>
          </div>

          <div className="bg-slate-800/50 border border-green-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Orders</div>
            <div className="text-2xl md:text-3xl font-bold text-green-400">{totalStats.totalOrders}</div>
            <div className="text-xs text-slate-500 mt-1">System-wide</div>
          </div>

          <div className="bg-slate-800/50 border border-yellow-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Exports</div>
            <div className="text-2xl md:text-3xl font-bold text-yellow-400">{totalStats.totalExports}</div>
            <div className="text-xs text-slate-500 mt-1">Documents</div>
          </div>

          <div className="bg-slate-800/50 border border-orange-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Value</div>
            <div className="text-2xl md:text-3xl font-bold text-orange-400">${totalStats.totalValue.toFixed(0)}</div>
            <div className="text-xs text-slate-500 mt-1">All orders</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Organizations
          </button>
          <button
            onClick={() => setActiveTab('exports')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'exports'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Export History
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Document Search
          </button>
        </div>

        <div className="p-6">
          {/* Organizations Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">All Organizations</h3>
                <button
                  onClick={loadDashboardData}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                >
                  🔄 Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Organization</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Members</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Orders</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Exports</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Total Value</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Google</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Last Export</th>
                      <th className="px-4 py-3 text-left text-white text-sm font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgStats.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                          No organizations found
                        </td>
                      </tr>
                    ) : (
                      orgStats.map((org) => (
                        <tr key={org.id} className="border-t border-slate-700 hover:bg-slate-750">
                          <td className="px-4 py-3 text-white font-medium">{org.organizationName}</td>
                          <td className="px-4 py-3 text-slate-300">{org.memberCount}</td>
                          <td className="px-4 py-3 text-slate-300">{org.totalOrders}</td>
                          <td className="px-4 py-3 text-slate-300">{org.totalExports}</td>
                          <td className="px-4 py-3 text-green-400">${org.totalValue.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            {org.googleConnected ? (
                              <span className="text-green-400">✓ Connected</span>
                            ) : (
                              <span className="text-red-400">✗ Not connected</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {org.lastExport ? formatDate(org.lastExport) : 'Never'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              org.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                            }`}>
                              {org.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Export History Tab */}
          {activeTab === 'exports' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Exports</h3>

              <div className="space-y-3">
                {exportHistory.map((exp) => (
                  <div
                    key={exp.id}
                    className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors cursor-pointer"
                    onClick={() => setSelectedExport(selectedExport?.id === exp.id ? null : exp)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-white font-semibold">{exp.organizationName}</div>
                          <div className="text-slate-400 text-sm">{exp.orderCount} orders</div>
                          <div className="text-green-400 text-sm font-medium">${exp.totalValue.toFixed(2)}</div>
                        </div>
                        <div className="text-sm text-slate-400 mb-2">
                          Customers: {exp.customerNames.join(', ')}
                        </div>
                        <div className="flex gap-4 text-xs text-slate-500">
                          <div>{formatDate(exp.exportedAt)}</div>
                          <div>{exp.screenshotUrls.length} screenshots</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={exp.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📄 View Doc
                        </a>
                      </div>
                    </div>

                    {/* Expanded view with screenshots */}
                    {selectedExport?.id === exp.id && (
                      <div className="mt-4 pt-4 border-t border-slate-600">
                        <div className="mb-3">
                          <div className="text-white font-medium mb-2">Package Numbers:</div>
                          <div className="flex flex-wrap gap-2">
                            {exp.packageNumbers.map((pkg, idx) => (
                              <span key={idx} className="px-2 py-1 bg-slate-600 rounded text-xs text-slate-300">
                                {pkg}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-white font-medium mb-2">Screenshots ({exp.screenshotUrls.length}):</div>
                          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {exp.screenshotUrls.map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={url}
                                  alt={`Screenshot ${idx + 1}`}
                                  className="w-full h-24 object-cover rounded border border-slate-600 hover:border-blue-500 transition-colors"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Tab */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="mb-6">
                <label className="block text-white font-medium mb-2">
                  Search Documents
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by customer name, organization, or package number..."
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    🔍 Search
                  </button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <div className="text-white font-medium mb-3">
                    Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </div>
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="bg-slate-700/30 rounded-lg p-4 border border-slate-600"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="text-white font-semibold">{result.organizationName}</div>
                            <div className="text-green-400 text-sm">${result.totalValue.toFixed(2)}</div>
                          </div>
                          <div className="text-sm text-slate-400 mb-2">
                            Customers: {result.customerNames.join(', ')}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDate(result.exportedAt)} • {result.screenshotUrls.length} screenshots
                          </div>
                        </div>
                        <a
                          href={result.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors whitespace-nowrap"
                        >
                          📄 Open
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  No documents found matching "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
