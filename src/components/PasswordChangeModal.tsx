import React, { useState } from 'react';
import { updatePassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import type { User } from '../types';

interface PasswordChangeModalProps {
  user: User;
  onPasswordChanged: () => void;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({ user, onPasswordChanged }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      // Re-authenticate user with current password first
      if (!auth.currentUser || !user.email) {
        throw new Error('Not authenticated');
      }

      await signInWithEmailAndPassword(auth, user.email, currentPassword);

      // Update password
      await updatePassword(auth.currentUser, newPassword);

      // Update Firestore to remove requirePasswordChange flag
      await updateDoc(doc(db, 'users', user.uid), {
        requirePasswordChange: false,
        passwordChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      alert('✅ Password changed successfully!');
      onPasswordChanged();
    } catch (error: any) {
      console.error('Password change error:', error);

      if (error.code === 'auth/wrong-password') {
        setError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setError('New password is too weak. Please choose a stronger password.');
      } else {
        setError('Failed to change password: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl max-w-md w-full border-2 border-yellow-500/50 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 p-6 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🔐</div>
            <div>
              <h2 className="text-2xl font-bold text-white">Password Change Required</h2>
              <p className="text-yellow-100 text-sm mt-1">Please set a new password to continue</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-4">
            <p className="text-yellow-200 text-sm">
              ⚠️ You are using a temporary password. For security, please change it now before continuing.
            </p>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-200 text-sm">❌ {error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Current Password (Temporary)
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Enter your temporary password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Min 6 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Re-enter new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-semibold transition-all shadow-lg disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Changing Password...
              </span>
            ) : (
              'Change Password & Continue'
            )}
          </button>

          <p className="text-slate-400 text-xs text-center mt-4">
            You cannot access the application until you change your password
          </p>
        </form>
      </div>
    </div>
  );
};

export default PasswordChangeModal;
