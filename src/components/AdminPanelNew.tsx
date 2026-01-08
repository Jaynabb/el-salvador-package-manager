import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import type { Organization, User } from '../types';

export default function AdminPanelNew() {
  const { currentUser, isMasterAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [orgUsers, setOrgUsers] = useState<Record<string, User[]>>({});
  const [loading, setLoading] = useState(true);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [showAddUser, setShowAddUser] = useState<string | null>(null); // organizationId

  // Form states
  const [orgForm, setOrgForm] = useState({
    organizationName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    ownerPassword: '' // Password for the organization owner account
  });

  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'organization-member' as 'organization-owner' | 'organization-member'
  });

  // Credentials modal state
  const [showCredentials, setShowCredentials] = useState(false);
  const [newOrgCredentials, setNewOrgCredentials] = useState({
    organizationName: '',
    ownerName: '',
    email: '',
    password: ''
  });

  // Debug: Log when credentials modal state changes
  useEffect(() => {
    console.log('🔔 Credentials modal state changed:', { showCredentials, credentials: newOrgCredentials });
  }, [showCredentials, newOrgCredentials]);

  useEffect(() => {
    if (!isMasterAdmin || !db) return;

    setLoading(true);

    // Real-time listener for organizations
    const unsubscribeOrgs = onSnapshot(
      collection(db, 'organizations'),
      (snapshot) => {
        const orgsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
          trialEndsAt: doc.data().trialEndsAt?.toDate(),
          currentPeriodEnd: doc.data().currentPeriodEnd?.toDate(),
          currentPeriodStart: doc.data().currentPeriodStart?.toDate(),
          cancelledAt: doc.data().cancelledAt?.toDate(),
          googleTokenExpiry: doc.data().googleTokenExpiry?.toDate(),
        })) as Organization[];

        setOrganizations(orgsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to organizations:', error);
        setLoading(false);
      }
    );

    // Real-time listener for users
    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const usersByOrg: Record<string, User[]> = {};

        snapshot.docs.forEach(doc => {
          const userData = doc.data() as User;
          if (userData.organizationId) {
            if (!usersByOrg[userData.organizationId]) {
              usersByOrg[userData.organizationId] = [];
            }
            usersByOrg[userData.organizationId].push({
              ...userData,
              uid: doc.id
            });
          }
        });

        setOrgUsers(usersByOrg);
      },
      (error) => {
        console.error('Error listening to users:', error);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      unsubscribeOrgs();
      unsubscribeUsers();
    };
  }, [isMasterAdmin, db]);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orgForm.ownerPassword || orgForm.ownerPassword.length < 6) {
      alert('❌ Please provide a password (min 6 characters) for the organization owner');
      return;
    }

    if (!currentUser?.email) {
      alert('❌ Admin email not found');
      return;
    }

    // Store credentials BEFORE we lose them
    const credentials = {
      organizationName: orgForm.organizationName,
      ownerName: orgForm.contactName,
      email: orgForm.contactEmail,
      password: orgForm.ownerPassword
    };

    try {
      console.log('Creating organization owner account...');

      // Step 1: Create Firebase Auth account for the owner (this will auto-sign them in, logging out admin)
      const userCredential = await createUserWithEmailAndPassword(
        auth!,
        orgForm.contactEmail,
        orgForm.ownerPassword
      );

      const ownerId = userCredential.user.uid;
      console.log('✓ Owner account created:', ownerId);

      // Step 2: Create organization with owner ID
      const orgRef = doc(collection(db!, 'organizations'));
      const newOrg = {
        organizationName: orgForm.organizationName,
        contactName: orgForm.contactName,
        contactEmail: orgForm.contactEmail,
        contactPhone: orgForm.contactPhone,
        address: orgForm.address,
        subscriptionStatus: 'active' as const,
        subscriptionTier: 'professional' as const,
        status: 'active' as const,
        memberCount: 1,
        maxMembers: 10,
        billingEmail: orgForm.contactEmail,
        googleConnected: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ownerId: ownerId
      };

      await setDoc(orgRef, newOrg);
      console.log('✓ Organization created:', orgRef.id);

      // Step 3: Create user document in Firestore (while owner is signed in)
      await setDoc(doc(db!, 'users', ownerId), {
        email: orgForm.contactEmail,
        displayName: orgForm.contactName,
        role: 'organization-owner',
        organizationId: orgRef.id,
        status: 'active',
        requirePasswordChange: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      console.log('✓ Owner user document created');

      // Step 4: Sign out the newly created owner
      await signOut(auth!);
      console.log('✓ Owner signed out');

      // Step 5: Show credentials in alert (works even when logged out)
      const emailTemplate = `Subject: Your ImportFlow Account is Ready

Hi ${credentials.ownerName},

Your organization "${credentials.organizationName}" has been set up in ImportFlow!

Login Details:
• URL: https://importflow-app.web.app
• Email: ${credentials.email}
• Temporary Password: ${credentials.password}

⚠️ You'll be required to change your password on first login.

Next Steps:
1. Log in and change your password
2. Connect Google Drive in Settings (for exports)
3. Add team members in Organization tab
4. Start uploading and managing orders!

Need help? Reply to this email.

Best regards,
ImportFlow Team`;

      alert(`✅ Organization Created Successfully!\n\n` +
            `Organization: ${credentials.organizationName}\n` +
            `Owner: ${credentials.ownerName}\n` +
            `Email: ${credentials.email}\n` +
            `Temporary Password: ${credentials.password}\n\n` +
            `📋 COPY THIS INFORMATION NOW!\n\n` +
            `An email template will be copied to your clipboard.\n\n` +
            `You will be logged out and redirected to the login page.`);

      // Copy email template to clipboard
      try {
        await navigator.clipboard.writeText(emailTemplate);
        console.log('✓ Email template copied to clipboard');
      } catch (clipboardError) {
        console.error('Failed to copy to clipboard:', clipboardError);
      }

      // Redirect to login page after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error: any) {
      console.error('Error creating organization:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (error.code === 'auth/email-already-in-use') {
        alert('❌ This email is already registered. Please use a different email or delete the existing account first.');
      } else {
        alert('❌ Failed to create organization: ' + error.message + '\n\nError code: ' + (error.code || 'unknown'));
      }
    }
  };

  const handleCreateUser = async (e: React.FormEvent, organizationId: string) => {
    e.preventDefault();

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth!,
        userForm.email,
        userForm.password
      );

      // Create user document in Firestore
      await setDoc(doc(db!, 'users', userCredential.user.uid), {
        email: userForm.email,
        displayName: userForm.displayName,
        role: userForm.role,
        organizationId: organizationId,
        status: 'active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      // Update organization member count
      const org = organizations.find(o => o.id === organizationId);
      if (org) {
        await updateDoc(doc(db!, 'organizations', organizationId), {
          memberCount: (org.memberCount || 0) + 1,
          updatedAt: Timestamp.now(),
          // Set as owner if this is the first user
          ...(org.memberCount === 0 && { ownerId: userCredential.user.uid })
        });
      }

      setUserForm({
        email: '',
        password: '',
        displayName: '',
        role: 'organization-member'
      });
      setShowAddUser(null);
      
      alert('User created successfully!');
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === 'auth/email-already-in-use') {
        alert('This email is already in use');
      } else {
        alert('Failed to create user: ' + error.message);
      }
    }
  };

  const toggleOrganization = (orgId: string) => {
    setExpandedOrgId(expandedOrgId === orgId ? null : orgId);
  };

  const handleDeactivateOrganization = async (orgId: string, orgName: string) => {
    if (!confirm(`Are you sure you want to deactivate "${orgName}"? Users will not be able to access this organization.`)) {
      return;
    }

    try {
      await updateDoc(doc(db!, 'organizations', orgId), {
        status: 'inactive',
        updatedAt: Timestamp.now()
      });
      alert('Organization deactivated successfully');
      
    } catch (error) {
      console.error('Error deactivating organization:', error);
      alert('Failed to deactivate organization');
    }
  };

  const handleActivateOrganization = async (orgId: string, orgName: string) => {
    if (!confirm(`Activate "${orgName}"?`)) {
      return;
    }

    try {
      await updateDoc(doc(db!, 'organizations', orgId), {
        status: 'active',
        updatedAt: Timestamp.now()
      });
      alert('Organization activated successfully');
      
    } catch (error) {
      console.error('Error activating organization:', error);
      alert('Failed to activate organization');
    }
  };

  const handleDeleteOrganization = async (orgId: string, orgName: string) => {
    if (!confirm(`⚠️ PERMANENT DELETE: Are you sure you want to delete "${orgName}"?\n\nThis will:\n- Delete the organization\n- Remove all users from this organization\n- This CANNOT be undone\n\nType "DELETE" to confirm`)) {
      return;
    }

    const confirmation = prompt('Type DELETE to confirm:');
    if (confirmation !== 'DELETE') {
      alert('Delete cancelled');
      return;
    }

    try {
      // Delete organization
      await deleteDoc(doc(db!, 'organizations', orgId));

      // Update all users in this org to remove organization reference
      const users = orgUsers[orgId] || [];
      for (const user of users) {
        await updateDoc(doc(db!, 'users', user.uid), {
          organizationId: null,
          status: 'inactive',
          updatedAt: Timestamp.now()
        });
      }

      alert('Organization deleted successfully');
      
    } catch (error) {
      console.error('Error deleting organization:', error);
      alert('Failed to delete organization');
    }
  };

  const handleDeactivateUser = async (userId: string, userName: string, orgId: string) => {
    if (!confirm(`Deactivate user "${userName}"? They will not be able to log in.`)) {
      return;
    }

    try {
      await updateDoc(doc(db!, 'users', userId), {
        status: 'inactive',
        updatedAt: Timestamp.now()
      });

      // Update organization member count
      const org = organizations.find(o => o.id === orgId);
      if (org) {
        await updateDoc(doc(db!, 'organizations', orgId), {
          memberCount: Math.max(0, (org.memberCount || 0) - 1),
          updatedAt: Timestamp.now()
        });
      }

      alert('User deactivated successfully');
      
    } catch (error) {
      console.error('Error deactivating user:', error);
      alert('Failed to deactivate user');
    }
  };

  const handleActivateUser = async (userId: string, userName: string, orgId: string) => {
    if (!confirm(`Activate user "${userName}"?`)) {
      return;
    }

    try {
      await updateDoc(doc(db!, 'users', userId), {
        status: 'active',
        updatedAt: Timestamp.now()
      });

      // Update organization member count
      const org = organizations.find(o => o.id === orgId);
      if (org) {
        await updateDoc(doc(db!, 'organizations', orgId), {
          memberCount: (org.memberCount || 0) + 1,
          updatedAt: Timestamp.now()
        });
      }

      alert('User activated successfully');
      
    } catch (error) {
      console.error('Error activating user:', error);
      alert('Failed to activate user');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string, orgId: string) => {
    if (!confirm(`⚠️ PERMANENT DELETE: Delete user "${userName}"?\n\nThis will:\n- Delete the user account\n- Remove all their data\n- This CANNOT be undone`)) {
      return;
    }

    try {
      await deleteDoc(doc(db!, 'users', userId));

      // Update organization member count
      const org = organizations.find(o => o.id === orgId);
      if (org) {
        await updateDoc(doc(db!, 'organizations', orgId), {
          memberCount: Math.max(0, (org.memberCount || 0) - 1),
          updatedAt: Timestamp.now()
        });
      }

      alert('User deleted successfully');
      
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  if (!isMasterAdmin) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
          <p className="text-red-400">Access denied. Master admin privileges required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="text-center text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="bg-slate-800/50 rounded-2xl p-4 md:p-8 border border-slate-700">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Master Admin Panel</h2>
            <p className="text-slate-400 mt-1">Manage organizations and their users</p>
          </div>
          <button
            onClick={() => setShowAddOrg(!showAddOrg)}
            className="px-4 py-2 md:px-6 md:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm md:text-base"
          >
            {showAddOrg ? '✖ Cancel' : '➕ Add Organization'}
          </button>
        </div>

        {/* Add Organization Form */}
        {showAddOrg && (
          <div className="bg-slate-700/50 rounded-xl p-4 md:p-6 mb-6 border border-slate-600">
            <h3 className="text-lg md:text-xl font-bold text-white mb-4">Create New Organization</h3>
            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgForm.organizationName}
                    onChange={(e) => setOrgForm({ ...orgForm, organizationName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="ABC Import Company"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgForm.contactName}
                    onChange={(e) => setOrgForm({ ...orgForm, contactName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={orgForm.contactEmail}
                    onChange={(e) => setOrgForm({ ...orgForm, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="contact@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={orgForm.contactPhone}
                    onChange={(e) => setOrgForm({ ...orgForm, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+503 1234-5678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Owner Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={orgForm.ownerPassword}
                    onChange={(e) => setOrgForm({ ...orgForm, ownerPassword: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Min 6 characters"
                  />
                  <p className="text-xs text-slate-400 mt-1">Password for the organization owner to log in</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={orgForm.address}
                    onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="123 Main St, San Salvador"
                  />
                </div>
              </div>
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-sm">
                <p className="text-blue-200">
                  ℹ️ This will create a Firebase Authentication account and Firestore user document for the organization owner.
                  They can log in immediately with the provided email and password.
                </p>
              </div>
              <button
                type="submit"
                className="w-full md:w-auto px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Create Organization & Owner Account
              </button>
            </form>
          </div>
        )}

        {/* Organizations List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">
              Organizations ({organizations.length})
            </h3>
          </div>

          {organizations.length === 0 ? (
            <div className="bg-slate-700/30 rounded-lg p-8 text-center">
              <p className="text-slate-400">No organizations yet. Create one to get started!</p>
            </div>
          ) : (
            organizations.map((org) => (
              <div
                key={org.id}
                className="bg-slate-700/50 rounded-xl border border-slate-600 overflow-hidden"
              >
                {/* Organization Header - Clickable */}
                <button
                  onClick={() => toggleOrganization(org.id)}
                  className="w-full px-4 md:px-6 py-4 flex items-center justify-between hover:bg-slate-700/70 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="text-lg md:text-xl font-bold text-white truncate">
                        {org.organizationName}
                      </h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        org.status === 'active'
                          ? 'bg-green-900/30 text-green-400 border border-green-700'
                          : 'bg-red-900/30 text-red-400 border border-red-700'
                      }`}>
                        {org.status}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-blue-900/30 text-blue-400 border border-blue-700">
                        {orgUsers[org.id]?.length || 0} users
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1 truncate">
                      {org.contactName} • {org.contactEmail}
                    </p>
                  </div>
                  <div className="text-slate-400 ml-2">
                    {expandedOrgId === org.id ? '▼' : '▶'}
                  </div>
                </button>

                {/* Expanded Content */}
                {expandedOrgId === org.id && (
                  <div className="px-4 md:px-6 py-4 bg-slate-800/50 border-t border-slate-600">
                    {/* Organization Actions */}
                    <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-slate-600">
                      {org.status === 'active' ? (
                        <button
                          onClick={() => handleDeactivateOrganization(org.id, org.organizationName)}
                          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          🔒 Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateOrganization(org.id, org.organizationName)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          ✅ Activate
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteOrganization(org.id, org.organizationName)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    {/* Organization Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <p className="text-slate-400 text-sm">Contact</p>
                        <p className="text-white">{org.contactName}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Email</p>
                        <p className="text-white break-all">{org.contactEmail}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Phone</p>
                        <p className="text-white">{org.contactPhone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Subscription</p>
                        <p className="text-white capitalize">{org.subscriptionStatus || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Users Section */}
                    <div className="border-t border-slate-600 pt-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
                        <h5 className="text-lg font-bold text-white">
                          Users ({orgUsers[org.id]?.length || 0})
                        </h5>
                        <button
                          onClick={() => setShowAddUser(showAddUser === org.id ? null : org.id)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {showAddUser === org.id ? '✖ Cancel' : '➕ Add User'}
                        </button>
                      </div>

                      {/* Add User Form */}
                      {showAddUser === org.id && (
                        <div className="bg-slate-700/50 rounded-lg p-4 mb-4 border border-slate-600">
                          <h6 className="text-white font-medium mb-3">Create New User</h6>
                          <form onSubmit={(e) => handleCreateUser(e, org.id)} className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                  Email *
                                </label>
                                <input
                                  type="email"
                                  required
                                  value={userForm.email}
                                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                  className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="user@company.com"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                  Password *
                                </label>
                                <input
                                  type="password"
                                  required
                                  value={userForm.password}
                                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                  className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Min 6 characters"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                  Display Name *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={userForm.displayName}
                                  onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                                  className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="John Doe"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                  Role *
                                </label>
                                <select
                                  value={userForm.role}
                                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                                  className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                  <option value="organization-owner">Owner</option>
                                  <option value="organization-member">Member</option>
                                </select>
                              </div>
                            </div>
                            <button
                              type="submit"
                              className="w-full md:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              Create User
                            </button>
                          </form>
                        </div>
                      )}

                      {/* Users List */}
                      {orgUsers[org.id] && orgUsers[org.id].length > 0 ? (
                        <div className="space-y-2">
                          {orgUsers[org.id].map((user) => (
                            <div
                              key={user.uid}
                              className="bg-slate-600/30 rounded-lg p-3"
                            >
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-medium truncate">{user.displayName}</p>
                                  <p className="text-slate-400 text-sm truncate">{user.email}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    user.role === 'organization-owner'
                                      ? 'bg-purple-900/30 text-purple-400 border border-purple-700'
                                      : 'bg-blue-900/30 text-blue-400 border border-blue-700'
                                  }`}>
                                    {user.role === 'organization-owner' ? 'Owner' : 'Member'}
                                  </span>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    user.status === 'active'
                                      ? 'bg-green-900/30 text-green-400 border border-green-700'
                                      : 'bg-red-900/30 text-red-400 border border-red-700'
                                  }`}>
                                    {user.status}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {user.status === 'active' ? (
                                  <button
                                    onClick={() => handleDeactivateUser(user.uid, user.displayName, org.id)}
                                    className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium transition-colors"
                                  >
                                    🔒 Deactivate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleActivateUser(user.uid, user.displayName, org.id)}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors"
                                  >
                                    ✅ Activate
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteUser(user.uid, user.displayName, org.id)}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-600/20 rounded-lg p-4 text-center">
                          <p className="text-slate-400 text-sm">No users yet. Add the first user above!</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Credentials Modal */}
      {showCredentials && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl max-w-2xl w-full border-2 border-green-500/50 shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="text-4xl">✅</div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Organization Created!</h2>
                  <p className="text-green-100 text-sm mt-1">Send these credentials to the organization owner</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Organization Info */}
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Organization</label>
                  <p className="text-white font-semibold text-lg">{newOrgCredentials.organizationName}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Owner</label>
                  <p className="text-white font-semibold">{newOrgCredentials.ownerName}</p>
                </div>
              </div>

              {/* Login Credentials Box */}
              <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 border-2 border-blue-500/50 rounded-lg p-5">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  Login Credentials
                </h3>

                <div className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="text-xs text-slate-300 uppercase tracking-wide block mb-2">Email</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newOrgCredentials.email}
                        readOnly
                        className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white font-mono text-sm"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(newOrgCredentials.email);
                          alert('Email copied!');
                        }}
                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-xs text-slate-300 uppercase tracking-wide block mb-2">Temporary Password</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newOrgCredentials.password}
                        readOnly
                        className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white font-mono text-sm"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(newOrgCredentials.password);
                          alert('Password copied!');
                        }}
                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>

                  {/* App URL */}
                  <div>
                    <label className="text-xs text-slate-300 uppercase tracking-wide block mb-2">App URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value="https://importflow-app.web.app"
                        readOnly
                        className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white font-mono text-sm"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('https://importflow-app.web.app');
                          alert('URL copied!');
                        }}
                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Copy All Button */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const emailTemplate = `Subject: Your ImportFlow Account is Ready

Hi ${newOrgCredentials.ownerName},

Your organization "${newOrgCredentials.organizationName}" has been set up in ImportFlow!

Login Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 URL: https://importflow-app.web.app
📧 Email: ${newOrgCredentials.email}
🔑 Temporary Password: ${newOrgCredentials.password}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ You'll be required to change your password on first login.

Next Steps:
1. Log in and change your password
2. Connect Google Drive in Settings (for exports)
3. Add team members in Organization tab
4. Start uploading and managing orders!

Need help? Reply to this email.

Best regards,
ImportFlow Team`;

                    navigator.clipboard.writeText(emailTemplate);
                    alert('📧 Email template copied! Paste into your email client.');
                  }}
                  className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  📧 Copy Email Template
                </button>

                <button
                  onClick={() => setShowCredentials(false)}
                  className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Done
                </button>
              </div>

              {/* Instructions */}
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-200 text-sm">
                  ⚠️ <strong>Important:</strong> Copy the email template above and send it to the owner. They will need these credentials to log in for the first time.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
