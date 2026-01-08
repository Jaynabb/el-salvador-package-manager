import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ScanPackage from './components/ScanPackage';
import PackageList from './components/PackageList';
import AdminPanelNew from './components/AdminPanelNew';
import MasterAdminDashboard from './components/MasterAdminDashboard';
import Login from './components/Login';
import OrderManagement from './components/OrderManagement';
import BulkScreenshotUpload from './components/BulkScreenshotUpload';
import Settings from './components/Settings';
import OAuthCallback from './components/OAuthCallback';
import GoogleDriveSetupPrompt from './components/GoogleDriveSetupPrompt';
import PasswordChangeModal from './components/PasswordChangeModal';
import { useAuth } from './contexts/AuthContext';
import type { Package, DashboardStats } from './types';
import { getPackages } from './services/firestoreClient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './services/firebase';

type Page = 'dashboard' | 'scan' | 'admin' | 'doc-manager' | 'whatsapp-inquiries' | 'app-inquiries' | 'upload' | 'settings';

const App: React.FC = () => {
  const { currentUser, loading: authLoading, signOut, isMasterAdmin } = useAuth();
  console.log('📦 App component rendering...', { currentUser, authLoading });

  // Check if this is the OAuth callback route
  const isOAuthCallback = window.location.pathname === '/oauth/callback' || window.location.search.includes('code=');

  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showGoogleDrivePrompt, setShowGoogleDrivePrompt] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
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
    if (currentUser?.organizationId) {
      loadPackages();
      checkGoogleDriveStatus();
    }
  }, [currentUser?.organizationId]);

  // Check if organization owner needs to connect Google Drive
  const checkGoogleDriveStatus = async () => {
    if (!currentUser || !db) return;

    // Only show prompt for organization owners
    if (currentUser.role !== 'organization-owner') return;

    // Only show if they have an organization
    if (!currentUser.organizationId) return;

    try {
      const orgDoc = await getDoc(doc(db, 'organizations', currentUser.organizationId));
      if (orgDoc.exists()) {
        const orgData = orgDoc.data();
        const isGoogleConnected = orgData.googleConnected || false;
        setGoogleConnected(isGoogleConnected);

        // Check if we've already shown the prompt this session
        const hasSeenPrompt = sessionStorage.getItem('google_drive_prompt_seen');

        // Show prompt if:
        // 1. Google is NOT connected
        // 2. Haven't seen prompt this session
        // 3. Haven't dismissed it permanently (could add localStorage check here)
        if (!isGoogleConnected && !hasSeenPrompt) {
          setShowGoogleDrivePrompt(true);
        }
      }
    } catch (error) {
      console.error('Error checking Google Drive status:', error);
    }
  };

  const handleDismissGooglePrompt = () => {
    setShowGoogleDrivePrompt(false);
    // Mark as seen for this session
    sessionStorage.setItem('google_drive_prompt_seen', 'true');
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if ((showSettingsDropdown || showMenuDropdown) && !target.closest('.relative')) {
        setShowSettingsDropdown(false);
        setShowMenuDropdown(false);
      }
    };

    if (showSettingsDropdown || showMenuDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSettingsDropdown, showMenuDropdown]);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const pkgs = await getPackages({ organizationId: currentUser?.organizationId });
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

  // Handle OAuth callback route
  if (isOAuthCallback) {
    return <OAuthCallback />;
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-lg mb-2">Loading ImportFlow...</div>
          <div className="text-slate-400 text-sm">Checking authentication...</div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!currentUser) {
    console.log('No current user, showing login');
    return <Login />;
  }

  console.log('✅ User authenticated, rendering dashboard for:', currentUser.email);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-white">📦 ImportFlow</h1>
              <p className="text-slate-400 text-xs md:text-sm truncate">El Salvador Package Import Manager</p>
            </div>
            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
              <div className="text-right hidden sm:block">
                <div className="text-white font-medium text-sm md:text-base truncate max-w-[120px] md:max-w-none">{currentUser.displayName}</div>
                {currentUser.organizationName && (
                  <div className="text-slate-300 text-xs truncate max-w-[150px]">{currentUser.organizationName}</div>
                )}
                <div className="text-slate-400 text-xs capitalize">{currentUser.role.replace('-', ' ')}</div>
              </div>
              <button
                onClick={signOut}
                className="px-3 md:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs md:text-sm transition-colors whitespace-nowrap"
              >
                <span className="hidden sm:inline">Sign Out</span>
                <span className="sm:hidden">Exit</span>
              </button>
            </div>
          </div>

          {/* Navigation - Mobile Hamburger + Desktop Tabs */}
          <nav>
            {/* Mobile: Hamburger Menu */}
            <div className="md:hidden">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg font-medium flex items-center justify-between"
              >
                <span>☰ Menu</span>
                <span>{showMobileMenu ? '▲' : '▼'}</span>
              </button>

              {showMobileMenu && (
                <div className="mt-2 bg-slate-700 border border-slate-600 rounded-lg overflow-hidden">
                  <button onClick={() => { setCurrentPage('dashboard'); setShowMobileMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-sm ${currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
                    {isMasterAdmin ? '👑 Dashboard' : '📊 Dashboard'}
                  </button>
                  {!isMasterAdmin && (
                    <>
                      <button onClick={() => { setCurrentPage('doc-manager'); setShowMobileMenu(false); }}
                        className={`w-full px-4 py-2 text-left text-sm ${currentPage === 'doc-manager' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
                        📊 Order Management
                      </button>
                      <button onClick={() => { setCurrentPage('upload'); setShowMobileMenu(false); }}
                        className={`w-full px-4 py-2 text-left text-sm ${currentPage === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
                        📤 Upload
                      </button>
                      <button onClick={() => { setCurrentPage('settings'); setShowMobileMenu(false); }}
                        className={`w-full px-4 py-2 text-left text-sm ${currentPage === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
                        ⚙️ Settings
                      </button>
                    </>
                  )}
                  {isMasterAdmin && (
                    <button onClick={() => { setCurrentPage('admin'); setShowMobileMenu(false); }}
                      className={`w-full px-4 py-2 text-left text-sm ${currentPage === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
                      ⚙️ Manage Orgs
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Desktop: Inline Tabs */}
            <div className="hidden md:flex gap-2 flex-wrap">
              <button onClick={() => setCurrentPage('dashboard')}
                className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                {isMasterAdmin ? '👑 Dashboard' : '📊 Dashboard'}
              </button>
              {!isMasterAdmin && (
                <>
                  <button onClick={() => setCurrentPage('doc-manager')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${currentPage === 'doc-manager' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    📊 Order Management
                  </button>
                  <button onClick={() => setCurrentPage('upload')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${currentPage === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    📤 Upload
                  </button>
                  <button onClick={() => setCurrentPage('settings')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${currentPage === 'settings' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    ⚙️ Settings
                  </button>
                </>
              )}
              {isMasterAdmin && (
                <button onClick={() => setCurrentPage('admin')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${currentPage === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                  ⚙️ Manage Orgs
                </button>
              )}
            </div>
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
              isMasterAdmin ? <MasterAdminDashboard /> : <Dashboard />
            )}
            {currentPage === 'doc-manager' && !isMasterAdmin && (
              <OrderManagement />
            )}
            {currentPage === 'upload' && !isMasterAdmin && (
              <BulkScreenshotUpload />
            )}
            {currentPage === 'settings' && !isMasterAdmin && (
              <Settings />
            )}
            {currentPage === 'admin' && isMasterAdmin && (
              <AdminPanelNew />
            )}
          </>
        )}
      </main>

      {/* Password Change Modal - shown to users who must change password on first login */}
      {currentUser?.requirePasswordChange && (
        <PasswordChangeModal
          user={currentUser}
          onPasswordChanged={() => window.location.reload()}
        />
      )}

      {/* Google Drive Setup Prompt - shown to org owners who haven't connected */}
      {!currentUser?.requirePasswordChange && showGoogleDrivePrompt && currentUser?.organizationId && (
        <GoogleDriveSetupPrompt
          organizationId={currentUser.organizationId}
          onDismiss={handleDismissGooglePrompt}
        />
      )}
    </div>
  );
};

export default App;
