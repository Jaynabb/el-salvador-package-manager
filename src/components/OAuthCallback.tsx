import React, { useEffect, useState } from 'react';
import { handleOAuthCallback, handleOrganizationOAuthCallback } from '../services/googleOAuthService';

/**
 * OAuth Callback Handler
 * Handles the redirect from Google OAuth and exchanges code for tokens
 */
const OAuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Connecting your Google account...');

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Extract authorization code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          throw new Error(error === 'access_denied' ? 'Access denied by user' : error);
        }

        if (!code) {
          throw new Error('No authorization code received');
        }

        setMessage('Exchanging tokens...');

        // Check if this is for organization or legacy importer
        const organizationId = localStorage.getItem('google_oauth_organization_id');
        const importerId = localStorage.getItem('google_oauth_importer_id');

        let result;
        if (organizationId) {
          result = await handleOrganizationOAuthCallback(code);
        } else if (importerId) {
          result = await handleOAuthCallback(code);
        } else {
          throw new Error('No organization or importer ID found');
        }

        if (!result.success) {
          throw new Error(result.error || 'Failed to complete authorization');
        }

        setStatus('success');
        setMessage('Successfully connected! Closing...');

        // Check if we're in a popup window
        const isPopup = window.opener && window.opener !== window;

        setTimeout(() => {
          if (isPopup) {
            // If opened as popup, notify parent and close popup
            try {
              // Refresh the parent window to show updated connection status
              window.opener.location.reload();
            } catch (e) {
              console.warn('Could not reload parent window:', e);
            }
            // Close the popup
            window.close();
          } else {
            // If full-page redirect (mobile), navigate normally
            const returnUrl = result.returnUrl || '/';
            window.location.href = returnUrl;
          }
        }, 1500);
      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Failed to connect Google account');

        // Check if we're in a popup window
        const isPopup = window.opener && window.opener !== window;

        // Redirect/close after showing error (shorter delay for popup)
        setTimeout(() => {
          if (isPopup) {
            // Close popup after error
            window.close();
          } else {
            // Navigate back on full-page redirect
            const returnUrl = localStorage.getItem('google_oauth_return_url') || '/';
            localStorage.removeItem('google_oauth_return_url');
            window.location.href = returnUrl;
          }
        }, isPopup ? 3000 : 15000); // 3 seconds for popup, 15 for full-page
      }
    };

    processCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 backdrop-blur-sm text-center">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            {status === 'processing' && (
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            )}
            {status === 'success' && (
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {status === 'error' && (
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>

          {/* Message */}
          <h2 className="text-xl font-semibold text-white mb-2">
            {status === 'processing' && 'Connecting...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Connection Failed'}
          </h2>
          <p className="text-slate-400">{message}</p>

          {/* Error help message */}
          {status === 'error' && (
            <div className="mt-4 text-sm text-slate-400">
              <p>Check the browser console (F12) for detailed error information.</p>
              <p className="mt-2">Redirecting in 15 seconds...</p>
            </div>
          )}

          {/* Manual redirect button for errors */}
          {status === 'error' && (
            <button
              onClick={() => {
                const isPopup = window.opener && window.opener !== window;
                if (isPopup) {
                  window.close();
                } else {
                  const returnUrl = localStorage.getItem('google_oauth_return_url') || '/';
                  localStorage.removeItem('google_oauth_return_url');
                  window.location.href = returnUrl;
                }
              }}
              className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {window.opener && window.opener !== window ? 'Close' : 'Go Back to Settings'}
            </button>
          )}

          {/* Google Logo */}
          {status === 'processing' && (
            <div className="mt-6 flex justify-center opacity-50">
              <svg className="w-12 h-12" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC04"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OAuthCallback;
