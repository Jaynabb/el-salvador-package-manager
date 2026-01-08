import React from 'react';
import { initiateOrganizationGoogleOAuth } from '../services/googleOAuthService';

interface GoogleDriveSetupPromptProps {
  organizationId: string;
  onDismiss: () => void;
}

/**
 * Full-screen modal that prompts organization owners to connect Google Drive
 * Shown immediately after first login if Google is not connected
 */
const GoogleDriveSetupPrompt: React.FC<GoogleDriveSetupPromptProps> = ({
  organizationId,
  onDismiss
}) => {
  const handleConnect = async () => {
    try {
      await initiateOrganizationGoogleOAuth(organizationId);
      // OAuth flow will redirect/popup
    } catch (error: any) {
      console.error('Error initiating Google OAuth:', error);
      alert('❌ Failed to connect Google Drive: ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl max-w-2xl w-full border-2 border-blue-500/30 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div className="text-5xl">🚀</div>
            <div>
              <h2 className="text-2xl font-bold text-white">Welcome to ImportFlow!</h2>
              <p className="text-blue-100 text-sm mt-1">Let's get you set up in 60 seconds</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">
              1
            </div>
            <div className="flex-1 h-1 bg-slate-700"></div>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-400 font-bold text-sm">
              2
            </div>
            <div className="flex-1 h-1 bg-slate-700"></div>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-400 font-bold text-sm">
              3
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span>🔗</span>
              Connect Your Google Drive
            </h3>
            <p className="text-slate-300 mb-4">
              To use ImportFlow's export features, connect your Google Drive account. This allows us to:
            </p>

            <div className="bg-slate-700/50 rounded-lg p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="text-green-400 text-xl flex-shrink-0">✓</div>
                <div>
                  <div className="text-white font-medium">Auto-create documents</div>
                  <div className="text-slate-400 text-sm">Generate professional order documents instantly</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-green-400 text-xl flex-shrink-0">✓</div>
                <div>
                  <div className="text-white font-medium">Organize in ImportFlow folder</div>
                  <div className="text-slate-400 text-sm">Keep everything neat in a dedicated folder</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-green-400 text-xl flex-shrink-0">✓</div>
                <div>
                  <div className="text-white font-medium">Track with Google Sheets</div>
                  <div className="text-slate-400 text-sm">Automatic spreadsheet syncing for all orders</div>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy note */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <div className="text-blue-400 text-xl flex-shrink-0">🔒</div>
              <div>
                <div className="text-blue-200 font-medium text-sm mb-1">Your data is secure</div>
                <div className="text-blue-300/80 text-xs">
                  We only access files we create. We never touch your existing Drive files or personal data.
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              onClick={handleConnect}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google Drive Now
            </button>

            <button
              onClick={onDismiss}
              className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg font-medium transition-colors"
            >
              I'll do this later
            </button>
          </div>

          <p className="text-slate-500 text-xs text-center">
            You can always connect later from Organization Settings
          </p>
        </div>
      </div>
    </div>
  );
};

export default GoogleDriveSetupPrompt;
