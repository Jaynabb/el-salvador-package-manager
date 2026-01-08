import React, { useState } from 'react';
import { doc, setDoc, updateDoc, Timestamp, collection } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function OrganizationSetup() {
  const { currentUser, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const createOrganization = async () => {
    if (!currentUser || !firebaseUser || !db) {
      setError('Not authenticated');
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

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
      setMessage(`✅ Created organization: ${organizationId}`);

      // Update user with organizationId
      await updateDoc(doc(db, 'users', currentUser.uid), {
        organizationId: organizationId,
        role: 'organization-owner',
        updatedAt: Timestamp.fromDate(now)
      });

      setMessage(`✅ Organization created successfully! Refreshing page...`);

      // Reload the page to refresh auth context
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (err: any) {
      console.error('Error creating organization:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (currentUser?.organizationId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-green-800 mb-2">
            ✅ Organization Already Set Up
          </h2>
          <p className="text-green-700">
            Your organization ID: <code className="bg-green-100 px-2 py-1 rounded">{currentUser.organizationId}</code>
          </p>
          <p className="text-green-700 mt-2">
            You can now use all features including Google Drive integration!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-2xl font-bold mb-4">⚙️ Organization Setup Required</h1>

        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
          <p className="text-yellow-800">
            Your account needs to be linked to an organization to access all features.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">User</label>
            <p className="text-gray-900">{currentUser?.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Display Name</label>
            <p className="text-gray-900">{currentUser?.displayName}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <p className="text-gray-900">{currentUser?.role}</p>
          </div>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
            <p className="text-green-800">{message}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <button
          onClick={createOrganization}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Organization...' : 'Create Organization'}
        </button>

        <p className="text-sm text-gray-500 mt-4">
          This will create a new organization and link your account to it. You'll get a 30-day professional trial.
        </p>
      </div>
    </div>
  );
}
