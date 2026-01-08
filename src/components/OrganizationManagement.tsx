import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc, updateDoc, Timestamp, serverTimestamp, collection, getDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut, initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { db, auth } from '../services/firebase';
import { initiateOrganizationGoogleOAuth } from '../services/googleOAuthService';
import type { Organization, User, OrganizationInvite, SubscriptionStatus } from '../types';

export default function OrganizationManagement() {
  const { currentUser, firebaseUser } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'organization-member' | 'importer-admin'>('organization-member');
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');
  const [setupError, setSetupError] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'organization-member' as 'organization-owner' | 'organization-member'
  });

  // Load organization data
  useEffect(() => {
    const loadOrganization = async () => {
      if (!currentUser?.organizationId || !db) {
        setLoading(false);
        return;
      }

      try {
        const orgRef = doc(db, 'organizations', currentUser.organizationId);
        const orgDoc = await getDoc(orgRef);

        if (orgDoc.exists()) {
          setOrganization({
            id: orgDoc.id,
            ...orgDoc.data(),
            createdAt: orgDoc.data().createdAt?.toDate(),
            updatedAt: orgDoc.data().updatedAt?.toDate(),
            googleTokenExpiry: orgDoc.data().googleTokenExpiry?.toDate(),
            currentPeriodStart: orgDoc.data().currentPeriodStart?.toDate(),
            currentPeriodEnd: orgDoc.data().currentPeriodEnd?.toDate(),
            trialEndsAt: orgDoc.data().trialEndsAt?.toDate(),
            cancelledAt: orgDoc.data().cancelledAt?.toDate(),
          } as Organization);
        }

        // Load members for organization owners
        if (currentUser.role === 'organization-owner') {
          const usersQuery = query(
            collection(db, 'users'),
            where('organizationId', '==', currentUser.organizationId)
          );
          const usersSnapshot = await getDocs(usersQuery);
          const membersData = usersSnapshot.docs.map(doc => ({
            uid: doc.id, // Use uid to match User interface
            ...doc.data()
          })) as User[];
          setMembers(membersData);
        }
      } catch (error) {
        console.error('Error loading organization:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrganization();
  }, [currentUser]);

  const createOrganization = async () => {
    if (!currentUser || !firebaseUser || !db) {
      setSetupError('Not authenticated');
      return;
    }

    setSetupLoading(true);
    setSetupMessage('');
    setSetupError('');

    try {
      const now = new Date();
      const orgRef = doc(collection(db, 'organizations'));
      const organizationId = orgRef.id;

      // Create organization
      const organizationData = {
        organizationName: currentUser.displayName || 'ImportFlow Organization',
        subscriptionStatus: 'trialing' as const,
        subscriptionTier: 'professional' as const,
        ownerId: currentUser.uid,
        memberCount: 1,
        maxMembers: 10,
        billingEmail: currentUser.email,
        status: 'active' as const,
        trialEndsAt: Timestamp.fromDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)), // 30 days
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
        googleConnected: false
      };

      await setDoc(orgRef, organizationData);
      setSetupMessage(`✅ Created organization: ${organizationId}`);

      // Update user with organizationId
      await updateDoc(doc(db, 'users', currentUser.uid), {
        organizationId: organizationId,
        role: 'organization-owner',
        updatedAt: Timestamp.fromDate(now)
      });

      setSetupMessage(`✅ Organization created successfully! Refreshing...`);

      // Reload the page to refresh auth context
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err: any) {
      console.error('Error creating organization:', err);
      setSetupError(`Error: ${err.message}`);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization || !auth || !db || !currentUser) {
      alert('Organization not loaded');
      return;
    }

    try {
      // First, check if a user with this email already exists in Firestore
      const usersRef = collection(db, 'users');
      const emailQuery = query(usersRef, where('email', '==', newMemberForm.email));
      const existingUsers = await getDocs(emailQuery);

      if (!existingUsers.empty) {
        // User exists - reactivate them
        const existingUserDoc = existingUsers.docs[0];
        const existingUserData = existingUserDoc.data();

        const reactivate = confirm(
          `User "${existingUserData.displayName}" (${newMemberForm.email}) already exists.\n\n` +
          `Current status: ${existingUserData.status}\n` +
          `Current organization: ${existingUserData.organizationId || 'None'}\n\n` +
          `Click OK to re-add them to your organization as ${newMemberForm.role}`
        );

        if (!reactivate) {
          return;
        }

        // Reactivate the user
        await updateDoc(doc(db, 'users', existingUserDoc.id), {
          organizationId: organization.id,
          role: newMemberForm.role,
          status: 'active',
          updatedAt: serverTimestamp()
        });

        // Update organization member count
        await updateDoc(doc(db, 'organizations', organization.id), {
          memberCount: (organization.memberCount || 0) + 1,
          updatedAt: serverTimestamp()
        });

        setNewMemberForm({
          email: '',
          password: '',
          displayName: '',
          role: 'organization-member'
        });
        setShowAddMember(false);

        alert(`✅ Member re-added successfully!\n\nEmail: ${newMemberForm.email}\nRole: ${newMemberForm.role}\n\nThey can now log in with their existing credentials.`);
        window.location.reload();
        return;
      }

      // User doesn't exist - create new account
      // Store member info BEFORE we lose it
      const memberInfo = {
        email: newMemberForm.email,
        displayName: newMemberForm.displayName,
        role: newMemberForm.role,
        password: newMemberForm.password
      };

      console.log('Creating new member account...');

      // Create user in Firebase Auth (this will auto-sign them in, logging out the owner)
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newMemberForm.email,
        newMemberForm.password
      );

      const newMemberUid = userCredential.user.uid;
      console.log('✓ Member account created:', newMemberUid);

      // Create user document in Firestore (while member is signed in)
      await setDoc(doc(db, 'users', newMemberUid), {
        email: newMemberForm.email,
        displayName: newMemberForm.displayName,
        role: newMemberForm.role,
        organizationId: organization.id,
        status: 'active',
        requirePasswordChange: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('✓ Member user document created');

      // Sign out the newly created member
      await firebaseSignOut(auth);
      console.log('✓ Member signed out');

      // Show credentials in alert (works even when logged out)
      alert(`✅ Member Created Successfully!\n\n` +
            `Name: ${memberInfo.displayName}\n` +
            `Email: ${memberInfo.email}\n` +
            `Temporary Password: ${memberInfo.password}\n` +
            `Role: ${memberInfo.role}\n\n` +
            `📋 COPY THIS INFORMATION NOW!\n\n` +
            `⚠️ They must change their password on first login.\n\n` +
            `You will be logged out. Please log back in to see the new member.`);

      // Redirect to login page
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error: any) {
      console.error('Error creating member:', error);

      if (error.code === 'auth/email-already-in-use') {
        alert('❌ This email is already registered. Please use a different email address.');
      } else {
        alert('❌ Failed to create member: ' + error.message);
      }
    }
  };

  const handleInviteMember = () => {
    if (!inviteEmail.trim()) {
      alert('Please enter an email address');
      return;
    }

    // TODO: Replace with actual API call
    alert(`📧 Invite sent to ${inviteEmail}\n\nRole: ${inviteRole}\n\n(Demo Mode - No actual email sent)`);
    setInviteEmail('');
  };

  const handleRemoveMember = async (userId: string, userName: string, userEmail: string) => {
    // Validation
    if (!userId || !db || !organization || !auth) {
      console.error('Missing required data:', { userId, db: !!db, organization: !!organization });
      alert('❌ Cannot remove member: Missing required data');
      return;
    }

    // Ask if they want to completely delete the account or just remove from org
    const deleteCompletely = confirm(
      `Remove "${userName}" from your organization?\n\n` +
      `Click OK to PERMANENTLY DELETE their account (they cannot be re-added with same email)\n` +
      `Click Cancel to just remove them from org (they can be re-added later)`
    );

    console.log('Removing member:', { userId, userName, userEmail, deleteCompletely, organizationId: organization.id });

    try {
      if (deleteCompletely) {
        // OPTION 1: Permanently delete the account
        // Note: We can only delete the currently signed-in user with client SDK
        // For production, this should use Firebase Admin SDK via Cloud Function

        // For now, just mark as deleted and show warning
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          organizationId: null,
          status: 'deleted',
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        alert(
          `⚠️ Member "${userName}" has been permanently deleted.\n\n` +
          `Email: ${userEmail}\n\n` +
          `They have been removed from your organization and their account has been deactivated.`
        );
      } else {
        // OPTION 2: Just remove from organization (soft delete)
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          organizationId: null,
          status: 'inactive',
          updatedAt: serverTimestamp()
        });

        alert(
          `✅ Member "${userName}" removed from organization.\n\n` +
          `Their account still exists and they can be re-invited later.`
        );
      }

      // Update organization member count based on actual active members
      const usersQuery = query(
        collection(db, 'users'),
        where('organizationId', '==', organization.id),
        where('status', '==', 'active')
      );
      const activeMembers = await getDocs(usersQuery);

      const orgRef = doc(db, 'organizations', organization.id);
      await updateDoc(orgRef, {
        memberCount: activeMembers.size,
        updatedAt: serverTimestamp()
      });

      window.location.reload();
    } catch (error) {
      console.error('Error removing member:', error);
      alert('❌ Failed to remove member: ' + (error as Error).message);
    }
  };

  const handleRevokeAccess = (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to revoke access for ${userName}?`)) {
      alert(`🚫 Access revoked for ${userName}\n\n(Demo Mode - No actual changes made)`);
    }
  };

  const handleCancelInvite = (inviteId: string, email: string) => {
    if (confirm(`Cancel invite for ${email}?`)) {
      alert(`❌ Invite cancelled for ${email}\n\n(Demo Mode)`);
    }
  };

  const handleConnectGoogleDrive = async () => {
    if (!organization) {
      alert('Organization not loaded');
      return;
    }

    try {
      console.log('🔐 Initiating Google OAuth for organization:', organization.id);
      await initiateOrganizationGoogleOAuth(organization.id);
      // OAuth flow will complete in popup or redirect
      // After success, page will reload and googleConnected will be true
    } catch (error: any) {
      console.error('Error initiating Google OAuth:', error);
      alert('❌ Failed to connect Google Drive: ' + error.message);
    }
  };

  const getStatusBadge = (status: SubscriptionStatus) => {
    const colors = {
      active: 'bg-green-100 text-green-800 border-green-300',
      trialing: 'bg-blue-100 text-blue-800 border-blue-300',
      past_due: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      cancelled: 'bg-red-100 text-red-800 border-red-300',
      suspended: 'bg-gray-100 text-gray-800 border-gray-300'
    };

    return colors[status] || colors.active;
  };

  const getTierName = (tier: string) => {
    const names = {
      free: 'Free Trial',
      starter: 'Starter',
      professional: 'Professional',
      enterprise: 'Enterprise'
    };
    return names[tier as keyof typeof names] || tier;
  };

  const getTierPrice = (tier: string) => {
    const prices = {
      free: '$0/month',
      starter: '$49/month',
      professional: '$99/month',
      enterprise: 'Contact Sales'
    };
    return prices[tier as keyof typeof prices] || 'N/A';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading organization...</div>
      </div>
    );
  }

  if (!organization && !currentUser?.organizationId) {
    return (
      <div className="bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-700">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">⚙️</div>
          <h2 className="text-2xl font-bold text-white mb-2">Organization Setup Required</h2>
          <p className="text-slate-400">Your account needs to be linked to an organization to access all features.</p>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">User</label>
              <p className="text-white">{currentUser?.email}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
              <p className="text-white">{currentUser?.displayName}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
              <p className="text-white capitalize">{currentUser?.role.replace('-', ' ')}</p>
            </div>
          </div>
        </div>

        {setupMessage && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 mb-4">
            <p className="text-green-400">{setupMessage}</p>
          </div>
        )}

        {setupError && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-4">
            <p className="text-red-400">{setupError}</p>
          </div>
        )}

        <button
          onClick={createOrganization}
          disabled={setupLoading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
        >
          {setupLoading ? 'Creating Organization...' : 'Create Organization'}
        </button>

        <p className="text-sm text-slate-400 mt-4 text-center">
          This will create a new organization and link your account to it. You'll get a 30-day professional trial.
        </p>
      </div>
    );
  }

  const isOwner = currentUser?.uid === organization.ownerId;

  // Calculate days until renewal, handling missing dates
  const daysUntilRenewal = organization.currentPeriodEnd
    ? Math.ceil((organization.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white">Organization Management</h1>
        <p className="text-slate-400 mt-1">
          Manage your team, subscription, and organization settings
        </p>
      </div>

      {/* Google Drive Connection - Critical for Export Functions */}
      {isOwner && !organization.googleConnected && (
        <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-2 border-blue-500/50 rounded-lg p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 text-4xl">🔗</div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-2">⚠️ Connect Google Drive Required</h2>
              <p className="text-blue-100 mb-4">
                To use export functions (create Google Docs and Sheets), you must connect your Google Drive account.
                This will allow ImportFlow to automatically create and manage documents for your organization.
              </p>
              <div className="bg-blue-950/50 rounded-lg p-4 mb-4">
                <div className="text-blue-200 text-sm font-medium mb-2">What will be created:</div>
                <ul className="text-blue-300 text-sm space-y-1 list-disc list-inside">
                  <li>An "ImportFlow" folder in your Google Drive</li>
                  <li>A master tracking spreadsheet for all packages</li>
                  <li>Individual order documents for each export</li>
                </ul>
              </div>
              <button
                onClick={handleConnectGoogleDrive}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Drive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Connected Status */}
      {isOwner && organization.googleConnected && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-green-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Google Drive Connected</h3>
                {organization.googleEmail && (
                  <p className="text-sm text-green-400">{organization.googleEmail}</p>
                )}
              </div>
            </div>
            {organization.googleSheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${organization.googleSheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
              >
                View Tracking Sheet →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Subscription Status - Owner Only */}
      {isOwner && (
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Subscription Status</h2>
            <p className="text-slate-400 text-sm">{organization.organizationName}</p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusBadge(organization.subscriptionStatus)}`}>
            {organization.subscriptionStatus.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">Current Plan</div>
            <div className="text-white text-xl font-bold">{getTierName(organization.subscriptionTier)}</div>
            <div className="text-slate-300 text-sm mt-1">{getTierPrice(organization.subscriptionTier)}</div>
          </div>

          <div className="bg-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">Team Members</div>
            <div className="text-white text-xl font-bold">
              {members.length} / {organization.maxMembers}
            </div>
            <div className="text-slate-300 text-sm mt-1">Active members</div>
          </div>

          <div className="bg-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">Renewal Date</div>
            <div className="text-white text-xl font-bold">{daysUntilRenewal} days</div>
            <div className="text-slate-300 text-sm mt-1">
              {organization.currentPeriodEnd?.toLocaleDateString()}
            </div>
          </div>
        </div>

        {organization.subscriptionStatus === 'past_due' && (
          <div className="mt-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-yellow-100 font-semibold">Payment Past Due</div>
                <div className="text-yellow-200 text-sm">
                  Please update your payment method to avoid service interruption.
                </div>
              </div>
            </div>
            <button className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium">
              Update Payment Method
            </button>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
            Upgrade Plan
          </button>
          <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium">
            Billing History
          </button>
        </div>
      </div>
      )}

      {/* Team Members - Owner Only */}
      {isOwner && (
      <div className="bg-slate-800 rounded-lg shadow-lg p-4 md:p-6 border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-bold text-white">Team Members</h2>
          <button
            onClick={() => setShowAddMember(!showAddMember)}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm whitespace-nowrap"
          >
            {showAddMember ? '✖ Cancel' : '➕ Add Member'}
          </button>
        </div>

        {/* Add Member Form */}
        {showAddMember && (
          <div className="bg-slate-700/50 rounded-lg p-4 mb-4 border border-slate-600">
            <h3 className="text-white font-medium mb-3">Create New Member</h3>
            <form onSubmit={handleCreateMember} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={newMemberForm.email}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm"
                    placeholder="member@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={newMemberForm.password}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Display Name *</label>
                  <input
                    type="text"
                    required
                    value={newMemberForm.displayName}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, displayName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Role *</label>
                  <select
                    value={newMemberForm.role}
                    onChange={(e) => setNewMemberForm({ ...newMemberForm, role: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm"
                  >
                    <option value="organization-member">Member</option>
                    <option value="organization-owner">Owner</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
              >
                Create Member
              </button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.uid}
              className="flex items-center justify-between p-4 bg-slate-700 rounded-lg border border-slate-600"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {member.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-medium">{member.displayName}</div>
                  <div className="text-slate-400 text-sm">{member.email}</div>
                  {member.phoneNumber && (
                    <div className="text-slate-500 text-xs mt-1">📱 {member.phoneNumber}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  member.role === 'organization-owner'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {member.role === 'organization-owner' ? 'Owner' : 'Member'}
                </span>

                {member.uid !== currentUser?.uid && (
                  <button
                    onClick={() => handleRemoveMember(member.uid, member.displayName, member.email)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Pending Invites - Owner Only */}
      {isOwner && invites.length > 0 && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Pending Invites</h2>

          <div className="space-y-3">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-4 bg-slate-700 rounded-lg border border-slate-600"
              >
                <div>
                  <div className="text-white font-medium">{invite.email}</div>
                  <div className="text-slate-400 text-sm">
                    Invited {invite.createdAt.toLocaleDateString()} • Expires {invite.expiresAt.toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                    Pending
                  </span>
                  {isOwner && (
                    <button
                      onClick={() => handleCancelInvite(invite.id, invite.email)}
                      className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite New Member */}
      {isOwner && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Invite Team Member</h2>

          {organization.memberCount >= organization.maxMembers ? (
            <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
              <div className="text-yellow-100 font-semibold mb-1">Member Limit Reached</div>
              <div className="text-yellow-200 text-sm">
                You've reached your plan's member limit ({organization.maxMembers} members).
                Upgrade your plan to add more team members.
              </div>
              <button className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium">
                Upgrade Plan
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="organization-member">Member</option>
                    <option value="importer-admin">Admin</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleInviteMember}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Send Invite
              </button>

              <div className="text-sm text-slate-400">
                <strong className="text-slate-300">Available seats:</strong> {organization.maxMembers - organization.memberCount} remaining
              </div>
            </div>
          )}
        </div>
      )}

      {/* Organization Settings */}
      {isOwner && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Organization Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Organization Name
              </label>
              <input
                type="text"
                defaultValue={organization.organizationName}
                className="w-full max-w-md px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Billing Email
              </label>
              <input
                type="email"
                defaultValue={organization.billingEmail}
                className="w-full max-w-md px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button className="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium">
              Save Changes
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
            <p className="text-slate-400 text-sm mb-4">
              Permanently delete your organization and all associated data. This action cannot be undone.
            </p>
            <button className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
              Delete Organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
