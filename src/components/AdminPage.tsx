import React, { useState, useEffect } from 'react';
import type { Importer, User, UserRole } from '../types';
import { getImporters, addImporter, updateImporter, deactivateImporter } from '../services/importerService';
import { getUsers, createUser, deactivateUser, reactivateUser } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

type AdminTab = 'importers' | 'users';

const AdminPage: React.FC = () => {
  const { currentUser, isMasterAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>(isMasterAdmin ? 'importers' : 'users');
  const [importers, setImporters] = useState<Importer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingImporter, setEditingImporter] = useState<Importer | null>(null);

  // Importer form state
  const [formData, setFormData] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    googleSheetsWebhookUrl: '',
    notes: '',
    status: 'active' as 'active' | 'inactive'
  });

  // User form state
  const [userFormData, setUserFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'importer-admin' as UserRole,
    importerId: ''
  });

  useEffect(() => {
    loadImporters();
    loadUsers();
  }, []);

  const loadImporters = async () => {
    try {
      setLoading(true);
      const data = await getImporters();
      setImporters(data);
    } catch (error) {
      console.error('Error loading importers:', error);
      alert('Failed to load importers');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('Failed to load users');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.businessName || !formData.contactName || !formData.email || !formData.phone) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingImporter) {
        // Update existing
        await updateImporter(editingImporter.id, formData);
      } else {
        // Add new
        await addImporter(formData);
      }

      // Reset form
      setFormData({
        businessName: '',
        contactName: '',
        email: '',
        phone: '',
        address: '',
        googleSheetsWebhookUrl: '',
        notes: '',
        status: 'active'
      });
      setShowForm(false);
      setEditingImporter(null);
      loadImporters();
    } catch (error) {
      console.error('Error saving importer:', error);
      alert('Failed to save importer');
    }
  };

  const handleEdit = (importer: Importer) => {
    setEditingImporter(importer);
    setFormData({
      businessName: importer.businessName,
      contactName: importer.contactName,
      email: importer.email,
      phone: importer.phone,
      address: importer.address || '',
      googleSheetsWebhookUrl: importer.googleSheetsWebhookUrl || '',
      notes: importer.notes || '',
      status: importer.status
    });
    setShowForm(true);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this importer?')) return;

    try {
      await deactivateImporter(id);
      loadImporters();
    } catch (error) {
      console.error('Error deactivating importer:', error);
      alert('Failed to deactivate importer');
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userFormData.email || !userFormData.password || !userFormData.displayName) {
      alert('Please fill in all required fields');
      return;
    }

    // For importer admins, automatically use their importerId
    const importerId = isMasterAdmin
      ? (userFormData.role === 'master-admin' ? undefined : userFormData.importerId)
      : currentUser?.importerId;

    if (!isMasterAdmin && !importerId) {
      alert('Error: Your account is not assigned to an importer');
      return;
    }

    if (isMasterAdmin && userFormData.role !== 'master-admin' && !userFormData.importerId) {
      alert('Please select an importer for non-master-admin users');
      return;
    }

    try {
      await createUser(
        userFormData.email,
        userFormData.password,
        userFormData.displayName,
        userFormData.role,
        importerId
      );

      // Reset form
      setUserFormData({
        email: '',
        password: '',
        displayName: '',
        role: 'importer-admin',
        importerId: ''
      });
      setShowForm(false);
      loadUsers();
      alert('User created successfully!');
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert(error.message || 'Failed to create user');
    }
  };

  const handleDeactivateUser = async (uid: string) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return;

    try {
      await deactivateUser(uid);
      loadUsers();
    } catch (error) {
      console.error('Error deactivating user:', error);
      alert('Failed to deactivate user');
    }
  };

  const handleReactivateUser = async (uid: string) => {
    if (!confirm('Reactivate this user?')) return;

    try {
      await reactivateUser(uid);
      loadUsers();
    } catch (error) {
      console.error('Error reactivating user:', error);
      alert('Failed to reactivate user');
    }
  };

  const activeImporters = importers.filter(i => i.status === 'active');
  const inactiveImporters = importers.filter(i => i.status === 'inactive');

  // Filter users based on role
  const filteredUsers = isMasterAdmin
    ? users
    : users.filter(u => u.importerId === currentUser?.importerId);

  const activeUsers = filteredUsers.filter(u => u.status === 'active');
  const inactiveUsers = filteredUsers.filter(u => u.status === 'inactive');

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-white">Admin Panel</h2>
          <p className="text-slate-400 mt-1">Manage your organizations and users</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-700">
          {isMasterAdmin && (
            <button
              onClick={() => {
                setActiveTab('importers');
                setShowForm(false);
              }}
              className={`px-6 py-3 font-medium transition-all border-b-2 ${
                activeTab === 'importers'
                  ? 'text-blue-400 border-blue-400'
                  : 'text-slate-400 border-transparent hover:text-slate-300'
              }`}
            >
              🏢 Organizations ({activeImporters.length})
            </button>
          )}
          <button
            onClick={() => {
              setActiveTab('users');
              setShowForm(false);
            }}
            className={`px-6 py-3 font-medium transition-all border-b-2 ${
              activeTab === 'users'
                ? 'text-blue-400 border-blue-400'
                : 'text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            👥 Users ({activeUsers.length})
          </button>
        </div>

        {/* Importers Tab */}
        {activeTab === 'importers' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">Organization Management</h3>
                <p className="text-slate-400 mt-1">{activeImporters.length} active organizations</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(!showForm);
                  setEditingImporter(null);
                  setFormData({
                    businessName: '',
                    contactName: '',
                    email: '',
                    phone: '',
                    address: '',
                    googleSheetsWebhookUrl: '',
                    notes: '',
                    status: 'active'
                  });
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                {showForm ? '✖ Cancel' : '➕ Add New Organization'}
              </button>
            </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-slate-700/50 rounded-xl p-6 mb-6 border border-slate-600">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingImporter ? 'Edit Organization' : 'Add New Organization'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Google Sheets Webhook URL
                </label>
                <input
                  type="url"
                  value={formData.googleSheetsWebhookUrl}
                  onChange={(e) => setFormData({ ...formData, googleSheetsWebhookUrl: e.target.value })}
                  placeholder="https://script.google.com/macros/s/..."
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Deploy GoogleAppsScript.js to their Google Sheet and paste the webhook URL here
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                >
                  {editingImporter ? '💾 Update Importer' : '➕ Add Importer'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingImporter(null);
                  }}
                  className="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Active Importers List */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-white">Active Importers</h3>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : activeImporters.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-700/30 rounded-lg">
              <div className="text-6xl mb-4">🏢</div>
              <p>No active importers yet. Add your first client above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeImporters.map((importer) => (
                <div
                  key={importer.id}
                  className="bg-slate-700/50 rounded-lg p-5 border border-slate-600 hover:border-slate-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-white">{importer.businessName}</h4>
                      <p className="text-sm text-slate-400">{importer.contactName}</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400 border border-green-500/50">
                      Active
                    </span>
                  </div>

                  <div className="space-y-1 text-sm mb-4">
                    <p className="text-slate-300">✉️ {importer.email}</p>
                    <p className="text-slate-300">📱 {importer.phone}</p>
                    {importer.address && <p className="text-slate-300">📍 {importer.address}</p>}
                    {importer.googleSheetsWebhookUrl && (
                      <p className="text-green-400 flex items-center gap-1">
                        <span>📊 Google Sheets Connected</span>
                      </p>
                    )}
                  </div>

                  {importer.notes && (
                    <p className="text-xs text-slate-400 mb-3 italic">{importer.notes}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(importer)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDeactivate(importer.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                    >
                      🚫 Deactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inactive Importers */}
        {inactiveImporters.length > 0 && (
          <div className="mt-8 space-y-4">
            <h3 className="text-xl font-bold text-slate-400">Inactive Importers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
              {inactiveImporters.map((importer) => (
                <div
                  key={importer.id}
                  className="bg-slate-700/30 rounded-lg p-5 border border-slate-600"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-lg font-bold text-slate-400">{importer.businessName}</h4>
                      <p className="text-sm text-slate-500">{importer.contactName}</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded bg-slate-500/20 text-slate-400 border border-slate-500/50">
                      Inactive
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">User Management</h3>
                <p className="text-slate-400 mt-1">{activeUsers.length} active users</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(!showForm);
                  setUserFormData({
                    email: '',
                    password: '',
                    displayName: '',
                    role: 'importer-admin',
                    importerId: ''
                  });
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                {showForm ? '✖ Cancel' : '➕ Add New User'}
              </button>
            </div>

            {/* User Form */}
            {showForm && (
              <div className="bg-slate-700/50 rounded-xl p-6 mb-6 border border-slate-600">
                <h3 className="text-xl font-bold text-white mb-4">Create New User</h3>
                <form onSubmit={handleUserSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={userFormData.email}
                        onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        placeholder="user@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Password *
                      </label>
                      <input
                        type="password"
                        required
                        value={userFormData.password}
                        onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        placeholder="Min 6 characters"
                        minLength={6}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Display Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={userFormData.displayName}
                        onChange={(e) => setUserFormData({ ...userFormData, displayName: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Role *
                      </label>
                      <select
                        value={userFormData.role}
                        onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                        className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="importer-admin">Importer Admin</option>
                        <option value="importer-user">Importer User</option>
                        {isMasterAdmin && <option value="master-admin">Master Admin</option>}
                      </select>
                    </div>
                  </div>

                  {isMasterAdmin && userFormData.role !== 'master-admin' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Assign to Importer *
                      </label>
                      <select
                        required
                        value={userFormData.importerId}
                        onChange={(e) => setUserFormData({ ...userFormData, importerId: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Select an importer...</option>
                        {activeImporters.map(importer => (
                          <option key={importer.id} value={importer.id}>
                            {importer.businessName}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">
                        This user will only have access to packages from this importer
                      </p>
                    </div>
                  )}

                  {!isMasterAdmin && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <p className="text-blue-300 text-sm">
                        ℹ️ Users you create will automatically be assigned to your organization: <strong>{importers.find(i => i.id === currentUser?.importerId)?.businessName || 'Your Company'}</strong>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                    >
                      ➕ Create User
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Active Users List */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-white">Active Users</h3>
              {loading ? (
                <div className="text-center py-8 text-slate-400">Loading...</div>
              ) : activeUsers.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-700/30 rounded-lg">
                  <div className="text-6xl mb-4">👥</div>
                  <p>No users yet. Create your first user above!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeUsers.map((user) => {
                    const userImporter = user.importerId ? importers.find(i => i.id === user.importerId) : null;
                    return (
                      <div
                        key={user.uid}
                        className="bg-slate-700/50 rounded-lg p-5 border border-slate-600 hover:border-slate-500 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="text-lg font-bold text-white">{user.displayName}</h4>
                            <p className="text-sm text-slate-400">{user.email}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded border ${
                            user.role === 'master-admin'
                              ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                              : user.role === 'importer-admin'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                              : 'bg-green-500/20 text-green-400 border-green-500/50'
                          }`}>
                            {user.role.replace('-', ' ')}
                          </span>
                        </div>

                        <div className="space-y-1 text-sm mb-4">
                          {userImporter && (
                            <p className="text-slate-300">🏢 {userImporter.businessName}</p>
                          )}
                          {user.lastLogin && (
                            <p className="text-slate-400 text-xs">
                              Last login: {user.lastLogin.toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeactivateUser(user.uid)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                          >
                            🚫 Deactivate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inactive Users */}
            {inactiveUsers.length > 0 && (
              <div className="mt-8 space-y-4">
                <h3 className="text-xl font-bold text-slate-400">Inactive Users</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                  {inactiveUsers.map((user) => (
                    <div
                      key={user.uid}
                      className="bg-slate-700/30 rounded-lg p-5 border border-slate-600"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-lg font-bold text-slate-400">{user.displayName}</h4>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                        <span className="px-2 py-1 text-xs rounded bg-slate-500/20 text-slate-400 border border-slate-500/50">
                          Inactive
                        </span>
                      </div>
                      <button
                        onClick={() => handleReactivateUser(user.uid)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors mt-2"
                      >
                        ✅ Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
