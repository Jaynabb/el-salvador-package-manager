import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, writeBatch, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { signOut, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import type { Organization, User, SubscriptionStatus } from '../types';
import { initiateOrganizationGoogleOAuth, disconnectOrganizationGoogleAccount } from '../services/googleOAuthService';

export default function Settings() {
  const { currentUser } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loadingOrganization, setLoadingOrganization] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'organization-member' as 'organization-owner' | 'organization-member'
  });

  // Load organization data and members
  useEffect(() => {
    const loadOrganization = async () => {
      if (!currentUser?.organizationId || !db) {
        setLoadingOrganization(false);
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
            uid: doc.id,
            ...doc.data()
          })) as User[];
          setMembers(membersData);
        }
      } catch (error) {
        console.error('Error loading organization:', error);
      } finally {
        setLoadingOrganization(false);
      }
    };

    loadOrganization();
  }, [currentUser]);

  const handleGoogleConnect = async () => {
    if (!currentUser?.organizationId) return;

    try {
      await initiateOrganizationGoogleOAuth(currentUser.organizationId);
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('Failed to connect Google account');
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!currentUser?.organizationId) return;

    if (!confirm('Are you sure you want to disconnect your Google account?')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      await disconnectOrganizationGoogleAccount(currentUser.organizationId);
      const orgRef = doc(db, 'organizations', currentUser.organizationId);
      const orgDoc = await getDoc(orgRef);
      if (orgDoc.exists()) {
        setOrganization({
          id: orgDoc.id,
          ...orgDoc.data(),
          createdAt: orgDoc.data().createdAt?.toDate(),
          updatedAt: orgDoc.data().updatedAt?.toDate(),
        } as Organization);
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      alert('Failed to disconnect Google account');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isTokenExpired = () => {
    if (!organization?.googleConnected || !organization?.googleTokenExpiry) {
      return false;
    }
    const now = new Date();
    const expiry = new Date(organization.googleTokenExpiry);
    return expiry.getTime() < now.getTime();
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization || !auth || !db || !currentUser) {
      alert('Organization not loaded');
      return;
    }

    try {
      const usersRef = collection(db, 'users');
      const emailQuery = query(usersRef, where('email', '==', newMemberForm.email));
      const existingUsers = await getDocs(emailQuery);

      if (!existingUsers.empty) {
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

        await updateDoc(doc(db, 'users', existingUserDoc.id), {
          organizationId: organization.id,
          role: newMemberForm.role,
          status: 'active',
          updatedAt: serverTimestamp()
        });

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

      const memberInfo = {
        email: newMemberForm.email,
        displayName: newMemberForm.displayName,
        role: newMemberForm.role,
        password: newMemberForm.password
      };

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newMemberForm.email,
        newMemberForm.password
      );

      const newMemberUid = userCredential.user.uid;

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

      await firebaseSignOut(auth);

      alert(`✅ Member Created Successfully!\n\n` +
            `Name: ${memberInfo.displayName}\n` +
            `Email: ${memberInfo.email}\n` +
            `Temporary Password: ${memberInfo.password}\n` +
            `Role: ${memberInfo.role}\n\n` +
            `📋 COPY THIS INFORMATION NOW!\n\n` +
            `⚠️ They must change their password on first login.\n\n` +
            `You will be logged out. Please log back in to see the new member.`);

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

  const handleRemoveMember = async (userId: string, userName: string, userEmail: string) => {
    if (!userId || !db || !organization || !auth) {
      alert('❌ Cannot remove member: Missing required data');
      return;
    }

    const deleteCompletely = confirm(
      `Remove "${userName}" from your organization?\n\n` +
      `Click OK to PERMANENTLY DELETE their account (they cannot be re-added with same email)\n` +
      `Click Cancel to just remove them from org (they can be re-added later)`
    );

    try {
      if (deleteCompletely) {
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

  const handleDeleteOrganization = async () => {
    if (!organization || !currentUser?.organizationId) {
      alert('❌ Organization not found');
      return;
    }

    const confirmStep1 = confirm(
      `⚠️ WARNING: You are about to DELETE your entire organization!\n\n` +
      `Organization: ${organization.organizationName}\n` +
      `Members: ${organization.memberCount || 0}\n\n` +
      `This will permanently delete:\n` +
      `• All organization data\n` +
      `• All member accounts\n` +
      `• All orders and history\n` +
      `• Google Drive connection\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Click OK to continue with deletion.`
    );

    if (!confirmStep1) return;

    const organizationName = organization.organizationName;
    const confirmStep2 = prompt(
      `⚠️ FINAL CONFIRMATION\n\n` +
      `To confirm deletion, please type the organization name exactly:\n\n` +
      `"${organizationName}"`
    );

    if (confirmStep2 !== organizationName) {
      alert('❌ Organization name did not match. Deletion cancelled.');
      return;
    }

    try {
      const orgRef = doc(db, 'organizations', currentUser.organizationId);
      await updateDoc(orgRef, {
        status: 'deleted',
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, where('organizationId', '==', currentUser.organizationId));
      const usersSnapshot = await getDocs(usersQuery);

      const batch = writeBatch(db);
      usersSnapshot.docs.forEach((userDoc) => {
        batch.update(userDoc.ref, {
          status: 'inactive',
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();

      alert(
        `✅ Organization "${organizationName}" has been deleted.\n\n` +
        `All member accounts have been deactivated.\n\n` +
        `You will be logged out now.`
      );

      await signOut(auth!);

    } catch (error) {
      console.error('❌ Error deleting organization:', error);
      alert('❌ Failed to delete organization: ' + (error as Error).message);
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

  const isOwner = currentUser?.role === 'organization-owner';
  const daysUntilRenewal = organization?.currentPeriodEnd
    ? Math.ceil((organization.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
        <p className="text-slate-400">
          Manage your organization, team, and preferences
        </p>
      </div>

      {/* Organization Profile */}
      {organization && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Organization Profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Organization Name</div>
              <div className="text-lg font-semibold text-white">{organization.organizationName || 'N/A'}</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Your Role</div>
              <div className="text-lg font-semibold text-white capitalize">
                {currentUser?.role === 'organization-owner' ? 'Owner' : 'Member'}
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Members</div>
              <div className="text-lg font-semibold text-white">{organization.memberCount || 0}</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Status</div>
              <div className="text-lg font-semibold text-green-400 capitalize">{organization.status || 'Active'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Status - Owner Only */}
      {isOwner && organization && (
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
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-700 rounded-lg border border-slate-600"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">{member.displayName}</div>
                    <div className="text-slate-400 text-sm">{member.email}</div>
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

      {/* Google Drive Integration Section - Only for Organization Owners */}
      {!loadingOrganization && currentUser?.role === 'organization-owner' && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Google Drive Integration</h3>
              <p className="text-sm text-slate-400">
                Connect your Google account to export orders to Google Docs
              </p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="mb-4">
            {organization?.googleConnected ? (
              isTokenExpired() ? (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-300">Authentication Expired</p>
                    {organization.googleEmail && (
                      <p className="text-xs text-red-400/70 mt-0.5">{organization.googleEmail}</p>
                    )}
                    <p className="text-xs text-red-400/70 mt-1">Your Google token has expired. Please reconnect to continue using Google Docs export.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-300">Connected</p>
                    {organization.googleEmail && (
                      <p className="text-xs text-green-400/70 mt-0.5">{organization.googleEmail}</p>
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">Not Connected</p>
                  <p className="text-xs text-slate-500 mt-0.5">Connect to enable Google Docs export</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {organization?.googleConnected ? (
              <>
                {isTokenExpired() && (
                  <button
                    onClick={handleGoogleConnect}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span className="whitespace-nowrap">Reconnect Google</span>
                  </button>
                )}
                <button
                  onClick={handleGoogleDisconnect}
                  disabled={isDisconnecting}
                  className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect Google'}
                </button>
              </>
            ) : (
              <button
                onClick={handleGoogleConnect}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="whitespace-nowrap">Connect Google</span>
              </button>
            )}
          </div>

          {/* Security Note */}
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-300">
              <strong>Secure:</strong> Your Google credentials are never stored. We only keep an access token to create files on your behalf.
            </p>
          </div>
        </div>
      )}

      {/* Info for Organization Members */}
      {!loadingOrganization && currentUser?.role === 'organization-member' && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 text-3xl">ℹ️</div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Google Drive Integration</h3>
              <p className="text-slate-300 text-sm mb-2">
                Your organization {organization?.googleConnected ? 'is' : 'is not currently'} connected to Google Drive.
              </p>
              {organization?.googleConnected ? (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-green-300">Connected to Google Drive</p>
                    {organization.googleEmail && (
                      <p className="text-xs text-green-400/70 mt-0.5">{organization.googleEmail}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-300">
                    ⚠️ Not connected to Google Drive. Contact your organization owner to enable Google Docs export.
                  </p>
                </div>
              )}
              <p className="text-slate-400 text-xs mt-3">
                Only the organization owner can connect or disconnect Google Drive. Once connected, all members can export orders to Google Docs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Organization Settings - Owner Only */}
      {isOwner && organization && (
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
        </div>
      )}

      {/* Notification Settings */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h3 className="text-xl font-semibold text-white mb-4">Notifications</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-slate-300">Email notifications for new packages</span>
            <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-slate-300">Export completion notifications</span>
            <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-slate-300">Daily summary reports</span>
            <input type="checkbox" className="w-5 h-5 rounded" />
          </label>
        </div>
      </div>

      {/* Danger Zone - Only for Organization Owners */}
      {currentUser?.role === 'organization-owner' && organization && (
        <div className="bg-red-900/20 border-2 border-red-500/50 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">⚠️</div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-400 mb-2">Danger Zone</h3>
              <p className="text-slate-300 text-sm mb-4">
                Once you delete your organization, there is no going back. This will permanently delete:
              </p>
              <ul className="text-slate-400 text-sm space-y-1 mb-4 list-disc list-inside">
                <li>All organization data and settings</li>
                <li>All member accounts ({organization.memberCount || 0} member{(organization.memberCount || 0) !== 1 ? 's' : ''})</li>
                <li>All orders and export history</li>
                <li>Google Drive connection</li>
              </ul>
              <button
                onClick={handleDeleteOrganization}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete Organization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
