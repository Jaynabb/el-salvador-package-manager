import React, { useState, useEffect } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { OrderRow } from './OrderManagement';

interface DashboardStats {
  totalOrders: number;
  totalValue: number;
  totalPieces: number;
  avgOrderValue: number;
  recentOrders: OrderRow[];
}

const Dashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    totalValue: 0,
    totalPieces: 0,
    avgOrderValue: 0,
    recentOrders: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    loadStats();
  }, [currentUser]);

  const loadStats = async () => {
    if (!currentUser?.organizationId) {
      console.warn('No organization ID available');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const ordersRef = collection(db, 'organizations', currentUser.organizationId, 'orders');
      const q = query(ordersRef);
      const snapshot = await getDocs(q);

      const orders: OrderRow[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as OrderRow));

      const totalValue = orders.reduce((sum, order) => sum + (order.value || 0), 0);
      const totalPieces = orders.reduce((sum, order) => sum + (order.pieces || 0), 0);
      const avgOrderValue = orders.length > 0 ? totalValue / orders.length : 0;

      // Get 5 most recent orders
      const recentOrders = orders
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5);

      setStats({
        totalOrders: orders.length,
        totalValue,
        totalPieces,
        avgOrderValue,
        recentOrders
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white">Dashboard</h2>
        <p className="text-slate-400 text-sm mt-1">Overview of your import operations</p>
      </div>

      {/* Order Management Statistics */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">📊 Order Management Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Orders</div>
            <div className="text-2xl md:text-3xl font-bold text-white">{stats.totalOrders}</div>
            <div className="text-xs text-slate-500 mt-1">All time</div>
          </div>

          <div className="bg-slate-800/50 border border-green-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Value</div>
            <div className="text-2xl md:text-3xl font-bold text-green-400">${stats.totalValue.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-1">Cumulative</div>
          </div>

          <div className="bg-slate-800/50 border border-blue-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Total Pieces</div>
            <div className="text-2xl md:text-3xl font-bold text-blue-400">{stats.totalPieces}</div>
            <div className="text-xs text-slate-500 mt-1">All orders</div>
          </div>

          <div className="bg-slate-800/50 border border-purple-700/50 rounded-xl p-4 md:p-6">
            <div className="text-slate-400 text-xs md:text-sm mb-1">Avg Order Value</div>
            <div className="text-2xl md:text-3xl font-bold text-purple-400">${stats.avgOrderValue.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-1">Per order</div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">📦 Recent Orders</h3>

        {stats.recentOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-6xl mb-4">📤</div>
            <p className="mb-2">No orders yet</p>
            <p className="text-sm">Upload screenshots to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stats.recentOrders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors"
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                  <div className="flex-1 w-full sm:w-auto">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-2">
                      <div className="text-lg font-semibold text-white">{order.packageNumber}</div>
                      <div className="text-slate-400 text-sm">{order.consignee}</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs sm:text-sm">
                      <div>
                        <span className="text-slate-500">Value:</span>{' '}
                        <span className="text-green-400 font-medium">${order.value.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Pieces:</span>{' '}
                        <span className="text-white">{order.pieces}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Company:</span>{' '}
                        <span className="text-white">{order.company || 'N/A'}</span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-slate-500">Tracking:</span>{' '}
                        <span className="text-white text-xs break-all">{order.trackingNumber || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 self-start sm:self-auto">
                    {formatTimeAgo(order.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
        <h3 className="text-blue-400 font-semibold mb-3 text-lg">💡 How ImportFlow Works:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex gap-3">
            <div className="text-2xl">1️⃣</div>
            <div>
              <div className="text-white font-medium mb-1">Upload Screenshots</div>
              <div className="text-sm text-slate-300">Upload order screenshots from computer or Google Drive</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">2️⃣</div>
            <div>
              <div className="text-white font-medium mb-1">AI Extraction</div>
              <div className="text-sm text-slate-300">AI automatically extracts customer, items, prices, tracking</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-2xl">3️⃣</div>
            <div>
              <div className="text-white font-medium mb-1">Manage & Export</div>
              <div className="text-sm text-slate-300">Edit data in Order Management, export to Google Docs</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
