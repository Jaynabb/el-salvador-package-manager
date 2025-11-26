import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ScanPackage from './components/ScanPackage';
import PackageList from './components/PackageList';
import type { Package, DashboardStats } from './types';
import { getPackages } from './services/firestoreClient';

type Page = 'dashboard' | 'scan' | 'packages';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalPackages: 0,
    packagesReceived: 0,
    packagesInCustoms: 0,
    packagesReadyForPickup: 0,
    packagesDelivered: 0,
    packagesOnHold: 0,
    totalValueInWarehouse: 0,
    pendingPayments: 0
  });

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const pkgs = await getPackages();
      setPackages(pkgs);
      calculateStats(pkgs);
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (pkgs: Package[]) => {
    const stats: DashboardStats = {
      totalPackages: pkgs.length,
      packagesReceived: pkgs.filter(p => p.status === 'received').length,
      packagesInCustoms: pkgs.filter(p => p.status === 'customs-pending').length,
      packagesReadyForPickup: pkgs.filter(p => p.status === 'ready-pickup').length,
      packagesDelivered: pkgs.filter(p => p.status === 'delivered').length,
      packagesOnHold: pkgs.filter(p => p.status === 'on-hold').length,
      totalValueInWarehouse: pkgs
        .filter(p => p.status !== 'delivered')
        .reduce((sum, p) => sum + p.totalValue, 0),
      pendingPayments: pkgs
        .filter(p => p.paymentStatus === 'pending')
        .reduce((sum, p) => sum + p.totalFees, 0)
    };
    setStats(stats);
  };

  const handlePackageAdded = () => {
    loadPackages();
  };

  const handlePackageUpdated = () => {
    loadPackages();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">📦 ImportFlow</h1>
              <p className="text-slate-400 text-sm">El Salvador Package Import Manager</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-white font-medium">Import & Customs Tracking</div>
                <div className="text-slate-400 text-sm">{stats.totalPackages} packages</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                currentPage === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setCurrentPage('scan')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                currentPage === 'scan'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📸 Scan Package
            </button>
            <button
              onClick={() => setCurrentPage('packages')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                currentPage === 'packages'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📦 All Packages
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {loading && currentPage === 'dashboard' ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-white text-lg">Loading...</div>
          </div>
        ) : (
          <>
            {currentPage === 'dashboard' && (
              <Dashboard stats={stats} packages={packages} onRefresh={loadPackages} />
            )}
            {currentPage === 'scan' && (
              <ScanPackage onPackageAdded={handlePackageAdded} />
            )}
            {currentPage === 'packages' && (
              <PackageList packages={packages} onPackageUpdated={handlePackageUpdated} />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
