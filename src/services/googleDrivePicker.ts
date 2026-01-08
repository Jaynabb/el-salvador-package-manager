/**
 * Google Drive Picker Service
 * Allows users to select files from their Google Drive
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || ''; // Optional: Your Google Cloud Project Number

// Scope for accessing Drive files
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// Validate configuration
const validateConfig = () => {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured. See GOOGLE_DRIVE_SETUP.md for setup instructions.');
  }
  if (!API_KEY) {
    throw new Error('VITE_GOOGLE_API_KEY is not configured. See GOOGLE_DRIVE_SETUP.md for setup instructions.');
  }
  if (!APP_ID) {
    console.warn('VITE_GOOGLE_APP_ID is not configured. Picker may not work properly.');
  }
};

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let pickerApiLoaded = false;
let oauthToken: string | null = null;

/**
 * Load Google APIs
 */
export const loadGoogleAPIs = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Load gapi
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = () => {
      window.gapi.load('client:picker', async () => {
        try {
          await window.gapi.client.load('drive', 'v3');
          pickerApiLoaded = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    };
    gapiScript.onerror = reject;
    document.body.appendChild(gapiScript);

    // Load GSI (Google Sign-In)
    const gsiScript = document.createElement('script');
    gsiScript.src = 'https://accounts.google.com/gsi/client';
    gsiScript.async = true;
    gsiScript.defer = true;
    document.body.appendChild(gsiScript);
  });
};

/**
 * Authenticate user with Google
 */
const authenticate = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response: any) => {
        if (response.error) {
          reject(response);
          return;
        }
        oauthToken = response.access_token;
        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken();
  });
};

/**
 * Open Google Drive Picker
 */
export const openDrivePicker = async (): Promise<File[]> => {
  // Validate configuration first
  try {
    validateConfig();
  } catch (error) {
    alert(`❌ Google Drive Configuration Error\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check GOOGLE_DRIVE_SETUP.md for instructions.`);
    throw error;
  }

  if (!pickerApiLoaded) {
    await loadGoogleAPIs();
  }

  // Get OAuth token if not already authenticated
  if (!oauthToken) {
    try {
      await authenticate();
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error('Failed to authenticate with Google Drive. Make sure your OAuth credentials are correct.');
    }
  }

  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.picker) {
      const error = new Error('Google Picker API not loaded. Please refresh the page and try again.');
      alert(`❌ ${error.message}`);
      reject(error);
      return;
    }

    try {
      const picker = new window.google.picker.PickerBuilder()
        .setAppId(APP_ID)
        .setOAuthToken(oauthToken!)
        .addView(
          new window.google.picker.DocsView()
            .setIncludeFolders(true)
            .setMimeTypes('image/png,image/jpeg,image/jpg')
            .setSelectFolderEnabled(false)
        )
        .addView(new window.google.picker.DocsUploadView())
        .setDeveloperKey(API_KEY)
        .setCallback(async (data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            try {
              const files = await downloadSelectedFiles(data.docs);
              resolve(files);
            } catch (error) {
              console.error('Failed to download files:', error);
              alert('❌ Failed to download selected files. Please try again.');
              reject(error);
            }
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve([]);
          }
        })
        .setTitle('Select Screenshots from Google Drive')
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('Failed to create picker:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('Invalid API key') || message.includes('API key')) {
        alert(`❌ Invalid Google API Key\n\nThe API key in your .env file is invalid or not enabled for the Picker API.\n\nPlease follow the setup guide in GOOGLE_DRIVE_SETUP.md:\n\n1. Go to Google Cloud Console\n2. Enable Google Picker API\n3. Create/update your API key\n4. Update VITE_GOOGLE_API_KEY in .env\n5. Restart the dev server`);
      } else {
        alert(`❌ Failed to open Google Drive picker\n\n${message}\n\nCheck GOOGLE_DRIVE_SETUP.md for troubleshooting.`);
      }

      reject(error);
    }
  });
};

/**
 * Download selected files from Google Drive
 */
const downloadSelectedFiles = async (docs: any[]): Promise<File[]> => {
  const files: File[] = [];

  for (const doc of docs) {
    try {
      // Get file metadata
      const response = await window.gapi.client.drive.files.get({
        fileId: doc.id,
        alt: 'media',
      });

      // Convert response to Blob
      const blob = await fetch(
        `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${oauthToken}`,
          },
        }
      ).then(r => r.blob());

      // Create File object
      const file = new File([blob], doc.name, {
        type: doc.mimeType,
      });

      files.push(file);
    } catch (error) {
      console.error(`Failed to download file ${doc.name}:`, error);
    }
  }

  return files;
};
