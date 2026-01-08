import React, { useState } from 'react';
import type { Importer } from '../types';
import { initiateGoogleOAuth, disconnectGoogleAccount } from '../services/googleOAuthService';

interface GoogleAccountConnectProps {
  importer: Importer;
  onConnectionChange?: () => void;
}

/**
 * Google Account Connection Component
 * Displays connection status and allows importers to connect/disconnect their Google account
 */
const GoogleAccountConnect: React.FC<GoogleAccountConnectProps> = ({
  importer,
  onConnectionChange,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);

    try {
      await initiateGoogleOAuth(importer.id);
      // OAuth flow will happen in popup window
      // After successful auth, the callback will update Firestore
      // We'll need to poll or listen for the update
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Google account? You will need to reconnect to create new documents and sheets.')) {
      return;
    }

    setError(null);
    setIsDisconnecting(true);

    try {
      await disconnectGoogleAccount(importer.id);
      onConnectionChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Google Drive Integration</h3>
          <p className="text-sm text-slate-400">
            Connect your Google account to automatically create documents and spreadsheets in your Drive
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="mb-4">
        {importer.googleConnected ? (
          <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-300">Connected</p>
              {importer.googleEmail && (
                <p className="text-xs text-green-400/70 mt-0.5">{importer.googleEmail}</p>
              )}
            </div>
            {importer.googleSheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${importer.googleSheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-400 hover:text-green-300 underline"
              >
                View Tracking Sheet
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">Not Connected</p>
              <p className="text-xs text-slate-500 mt-0.5">Connect to enable automatic exports</p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Features List */}
      <div className="mb-6 space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">What you get:</p>
        <ul className="space-y-2 text-sm text-slate-300">
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Automatic Google Sheets creation for package tracking</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Automatic Google Docs creation for package details</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>All files organized in your Google Drive</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>No manual script setup required</span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {importer.googleConnected ? (
          <button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect Google Account'}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {isConnecting ? 'Connecting...' : 'Connect Google Account'}
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
  );
};

export default GoogleAccountConnect;
