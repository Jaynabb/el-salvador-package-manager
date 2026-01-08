import React from 'react';

/**
 * SignUp Component - DISABLED FOR SECURITY
 *
 * Public sign-up has been disabled to prevent unauthorized access.
 * Only organization owners can add new members through the Organization Management page.
 */
const SignUp: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 backdrop-blur-sm text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-4">Sign-Up Disabled</h2>
          <p className="text-slate-300 mb-6">
            Public sign-up has been disabled for security. New accounts can only be created by organization owners.
          </p>
          <p className="text-slate-400 text-sm mb-6">
            If you need access, please contact your organization owner to add you as a member.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
