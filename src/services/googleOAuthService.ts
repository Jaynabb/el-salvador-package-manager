import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Importer } from '../types';

/**
 * Google OAuth Service
 * Handles OAuth flow for connecting importer Google accounts
 * Enables direct API access to Google Sheets and Docs
 */

// OAuth Configuration
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || window.location.origin + '/oauth/callback';

// Scopes needed for Sheets and Docs access
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email', // Get user email
  'https://www.googleapis.com/auth/drive.file', // Create and manage files
  'https://www.googleapis.com/auth/spreadsheets', // Create and edit spreadsheets
  'https://www.googleapis.com/auth/documents', // Create and edit documents
].join(' ');

/**
 * Initialize Google API client
 */
export const initGoogleAPI = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      // @ts-ignore - gapi is loaded from CDN
      window.gapi.load('client:auth2', async () => {
        try {
          // @ts-ignore
          await window.gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: [
              'https://sheets.googleapis.com/$discovery/rest?version=v4',
              'https://docs.googleapis.com/$discovery/rest?version=v1',
              'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            ],
            scope: SCOPES,
          });
          console.log('✓ Google API initialized');
          resolve();
        } catch (error) {
          console.error('Failed to initialize Google API:', error);
          reject(error);
        }
      });
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

/**
 * Detect if user is on mobile device
 */
const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768);
};

/**
 * Start OAuth flow for ORGANIZATIONS - opens Google sign-in popup or redirects on mobile
 */
export const initiateOrganizationGoogleOAuth = async (organizationId: string): Promise<void> => {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID not configured');
  }

  // Store organization ID in localStorage (persists across redirects)
  localStorage.setItem('google_oauth_organization_id', organizationId);
  localStorage.setItem('google_oauth_entity_type', 'organization');
  localStorage.setItem('google_oauth_return_url', window.location.pathname);

  // Build OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline'); // Get refresh token
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

  // DEBUG: Log the exact OAuth configuration
  console.log('🔐 OAuth Configuration for Organizations:');
  console.log('  Client ID:', CLIENT_ID);
  console.log('  Redirect URI:', REDIRECT_URI);
  console.log('  Full OAuth URL:', authUrl.toString());

  // On mobile, use full-page redirect instead of popup
  // Popups are often blocked on mobile browsers
  if (isMobileDevice()) {
    console.log('Mobile device detected - using full-page redirect for OAuth');
    window.location.href = authUrl.toString();
  } else {
    // Desktop: use popup
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl.toString(),
      'Google OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  }
};

/**
 * Start OAuth flow for IMPORTERS (legacy) - opens Google sign-in popup or redirects on mobile
 */
export const initiateGoogleOAuth = async (importerId: string): Promise<void> => {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID not configured');
  }

  // Store importer ID in localStorage (persists across redirects)
  localStorage.setItem('google_oauth_importer_id', importerId);
  localStorage.setItem('google_oauth_entity_type', 'importer');
  localStorage.setItem('google_oauth_return_url', window.location.pathname);

  // Build OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline'); // Get refresh token
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

  // On mobile, use full-page redirect instead of popup
  // Popups are often blocked on mobile browsers
  if (isMobileDevice()) {
    console.log('Mobile device detected - using full-page redirect for OAuth');
    window.location.href = authUrl.toString();
  } else {
    // Desktop: use popup
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl.toString(),
      'Google OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  }
};

/**
 * Handle OAuth callback and exchange code for tokens
 */
export const handleOAuthCallback = async (code: string): Promise<{
  success: boolean;
  error?: string;
  returnUrl?: string;
}> => {
  try {
    const entityType = localStorage.getItem('google_oauth_entity_type') || 'importer';
    const organizationId = localStorage.getItem('google_oauth_organization_id');
    const importerId = localStorage.getItem('google_oauth_importer_id');
    const returnUrl = localStorage.getItem('google_oauth_return_url') || '/';

    const entityId = entityType === 'organization' ? organizationId : importerId;

    if (!entityId) {
      throw new Error(`No ${entityType} ID found in session`);
    }

    console.log(`🔐 Processing OAuth for ${entityType}: ${entityId}`);

    // Exchange authorization code for tokens
    // Note: This should be done server-side in production for security
    const tokenResponse = await exchangeCodeForTokens(code);

    if (!tokenResponse.access_token) {
      throw new Error('No access token received');
    }

    console.log('✅ Received access token');

    // Get user's Google email
    const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);
    console.log(`✅ Got Google user info: ${userInfo.email}`);

    // Create Drive folder for exported docs
    const { folderId, sheetId } = await setupGoogleDrive(tokenResponse.access_token, entityId);
    console.log(`✅ Created Drive folder: ${folderId}`);
    console.log(`✅ Created tracking sheet: ${sheetId}`);

    // Store tokens in Firestore based on entity type
    if (entityType === 'organization') {
      await updateOrganizationGoogleAuth(entityId, {
        googleConnected: true,
        googleAccessToken: tokenResponse.access_token,
        googleRefreshToken: tokenResponse.refresh_token,
        googleTokenExpiry: new Date(Date.now() + (tokenResponse.expires_in * 1000)),
        googleEmail: userInfo.email,
        googleDriveFolderId: folderId,
        googleSheetId: sheetId,
      });
      console.log('✅ Updated organization with Google auth');
    } else {
      await updateImporterGoogleAuth(entityId, {
        googleConnected: true,
        googleAccessToken: tokenResponse.access_token,
        googleRefreshToken: tokenResponse.refresh_token,
        googleTokenExpiry: new Date(Date.now() + (tokenResponse.expires_in * 1000)),
        googleEmail: userInfo.email,
        googleDriveFolderId: folderId,
        googleSheetId: sheetId,
      });
      console.log('✅ Updated importer with Google auth');
    }

    // Clear localStorage
    localStorage.removeItem('google_oauth_organization_id');
    localStorage.removeItem('google_oauth_importer_id');
    localStorage.removeItem('google_oauth_entity_type');
    localStorage.removeItem('google_oauth_return_url');

    return { success: true, returnUrl };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Exchange authorization code for access and refresh tokens
 */
const exchangeCodeForTokens = async (code: string): Promise<any> => {
  // In production, this MUST be done server-side to keep client_secret secure
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Token exchange error:', error);
    console.error('Request details:', {
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      has_client_secret: !!CLIENT_SECRET
    });
    throw new Error(error.error_description || error.error || 'Token exchange failed');
  }

  return response.json();
};

/**
 * Fetch Google user info
 */
const fetchGoogleUserInfo = async (accessToken: string): Promise<{ email: string }> => {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return response.json();
};

/**
 * Setup Google Drive folder for storing exported docs
 * Note: Only docs are stored in customer's Drive, not sheets
 * Checks for existing folder first to avoid creating duplicates
 */
const setupGoogleDrive = async (
  accessToken: string,
  importerId: string
): Promise<{ folderId: string }> => {
  const folderName = 'ImportFlow - Exported Orders';

  // First, check if folder already exists
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (searchResponse.ok) {
    const searchResults = await searchResponse.json();
    if (searchResults.files && searchResults.files.length > 0) {
      // Folder exists, use it
      const folderId = searchResults.files[0].id;
      console.log('✓ Using existing Google Drive folder:', folderId);
      return { folderId };
    }
  }

  // Folder doesn't exist, create it
  const folderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!folderResponse.ok) {
    throw new Error('Failed to create Drive folder');
  }

  const folder = await folderResponse.json();
  const folderId = folder.id;

  console.log('✓ Created new Google Drive folder for exported docs:', folderId);

  return { folderId };
};

/**
 * Update importer with Google auth details (legacy)
 */
const updateImporterGoogleAuth = async (
  importerId: string,
  authData: Partial<Importer>
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const importerRef = doc(db, 'importers', importerId);

  // Use setDoc with merge to create document if it doesn't exist
  const { setDoc } = await import('firebase/firestore');
  await setDoc(importerRef, {
    ...authData,
    updatedAt: new Date(),
  }, { merge: true });
};

/**
 * Update organization with Google auth details
 */
const updateOrganizationGoogleAuth = async (
  organizationId: string,
  authData: any
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const orgRef = doc(db, 'organizations', organizationId);
  await updateDoc(orgRef, {
    ...authData,
    updatedAt: new Date(),
  });
};

/**
 * Refresh access token using refresh token
 */
export const refreshGoogleToken = async (refreshToken: string): Promise<string> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const data = await response.json();
  return data.access_token;
};

/**
 * Get valid access token (refresh if needed)
 */
export const getValidAccessToken = async (importer: Importer): Promise<string | null> => {
  if (!importer.googleConnected || !importer.googleAccessToken) {
    return null;
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const now = new Date();
  const expiry = importer.googleTokenExpiry ? new Date(importer.googleTokenExpiry) : null;

  if (expiry && expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
    // Token expired or about to expire, refresh it
    if (!importer.googleRefreshToken) {
      throw new Error('No refresh token available');
    }

    const newAccessToken = await refreshGoogleToken(importer.googleRefreshToken);

    // Update in Firestore
    await updateImporterGoogleAuth(importer.id, {
      googleAccessToken: newAccessToken,
      googleTokenExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
    });

    return newAccessToken;
  }

  return importer.googleAccessToken;
};

/**
 * Disconnect Google account (legacy)
 */
export const disconnectGoogleAccount = async (importerId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const importerRef = doc(db, 'importers', importerId);
  await updateDoc(importerRef, {
    googleConnected: false,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    googleEmail: null,
    updatedAt: new Date(),
  });
};

/**
 * Handle OAuth callback for organization (DEPRECATED - use handleOAuthCallback)
 */
export const handleOrganizationOAuthCallback = async (code: string): Promise<{
  success: boolean;
  error?: string;
  returnUrl?: string;
}> => {
  try {
    const organizationId = localStorage.getItem('google_oauth_organization_id');
    const returnUrl = localStorage.getItem('google_oauth_return_url') || '/';

    if (!organizationId) {
      throw new Error('No organization ID found');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForTokens(code);

    if (!tokenResponse.access_token) {
      throw new Error('No access token received');
    }

    // CRITICAL: Check if refresh token was provided
    if (!tokenResponse.refresh_token) {
      console.error('⚠️ No refresh token received from Google!');
      console.error('This means the app was already authorized. The connection will expire.');
      throw new Error('No refresh token received from Google. This can happen if you previously authorized the app. Please revoke access in your Google Account settings (https://myaccount.google.com/permissions) and try connecting again.');
    }

    console.log('✓ Refresh token received - connection will auto-renew');

    // Get user's Google email
    const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);

    // Create Drive folder for exported docs (no sheets stored in customer Drive)
    const { folderId } = await setupGoogleDrive(tokenResponse.access_token, organizationId);

    // Store tokens in Firestore organization
    await updateOrganizationGoogleAuth(organizationId, {
      googleConnected: true,
      googleAccessToken: tokenResponse.access_token,
      googleRefreshToken: tokenResponse.refresh_token,
      googleTokenExpiry: new Date(Date.now() + (tokenResponse.expires_in * 1000)),
      googleEmail: userInfo.email,
      googleDriveFolderId: folderId,
    });

    console.log('✓ Google tokens saved to Firestore with refresh token');

    // Clear localStorage
    localStorage.removeItem('google_oauth_organization_id');
    localStorage.removeItem('google_oauth_return_url');

    return { success: true, returnUrl };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Disconnect Google account for organization
 */
export const disconnectOrganizationGoogleAccount = async (organizationId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const orgRef = doc(db, 'organizations', organizationId);
  await updateDoc(orgRef, {
    googleConnected: false,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    googleEmail: null,
    updatedAt: new Date(),
  });
};
