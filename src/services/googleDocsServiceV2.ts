import type { Package, Importer } from '../types';
import { getValidAccessToken } from './googleOAuthService';

/**
 * Google Docs Service V2 - OAuth Edition
 * Creates formatted package documents in Google Docs using OAuth
 * No Cloud Functions required
 */

/**
 * Create a package document in Google Docs
 */
export const createPackageDocument = async (
  pkg: Package,
  importer: Importer
): Promise<{ success: boolean; docUrl?: string; error?: string }> => {
  try {
    // Get valid access token
    const accessToken = await getValidAccessToken(importer);
    if (!accessToken) {
      return { success: false, error: 'Google account not connected' };
    }

    // Create the document
    const docId = await createDocument(pkg, importer, accessToken);

    // Format the document content
    await formatDocument(pkg, docId, accessToken);

    // Move to ImportFlow folder if exists
    if (importer.googleDriveFolderId) {
      await moveToFolder(docId, importer.googleDriveFolderId, accessToken);
    }

    const docUrl = `https://docs.google.com/document/d/${docId}`;
    console.log('✓ Created package document:', docUrl);

    return { success: true, docUrl };
  } catch (error) {
    console.error('Failed to create package document:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Create a new Google Doc
 */
const createDocument = async (
  pkg: Package,
  importer: Importer,
  accessToken: string
): Promise<string> => {
  const title = `Package ${pkg.packageNumber} - ${pkg.customerName}`;

  const response = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create document');
  }

  const doc = await response.json();
  return doc.documentId;
};

/**
 * Format document with package information
 */
const formatDocument = async (
  pkg: Package,
  docId: string,
  accessToken: string
): Promise<void> => {
  // Build document content
  const requests = buildDocumentRequests(pkg);

  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to format document');
  }
};

/**
 * Build document formatting requests - MVP Format
 *
 * Format:
 * [Customer Name]
 * Paquete #[Number]
 * USPS #[Last 4 tracking]
 * VALOR: $[Total]
 *
 * [Product images/screenshots]
 */
const buildDocumentRequests = (pkg: Package): any[] => {
  const requests: any[] = [];
  let index = 1; // Start after title

  // Helper to insert text
  const insertText = (text: string) => {
    requests.push({
      insertText: {
        location: { index },
        text,
      },
    });
    index += text.length;
  };

  // Helper to insert bold text
  const insertBoldText = (text: string) => {
    const startIndex = index;
    insertText(text);
    requests.push({
      updateTextStyle: {
        range: {
          startIndex,
          endIndex: index,
        },
        textStyle: {
          bold: true,
        },
        fields: 'bold',
      },
    });
  };

  // MVP Format - Simple and clean
  // Customer Name (bold)
  insertBoldText(pkg.customerName);
  insertText('\n');

  // Package Number
  insertText(`${pkg.packageNumber}\n`);

  // Tracking Number - Get last 4 digits
  let trackingLast4 = 'N/A';
  if (pkg.trackingNumbers && pkg.trackingNumbers.length > 0) {
    const firstTracking = pkg.trackingNumbers[0];
    if (firstTracking && firstTracking !== 'N/A') {
      // Detect carrier from tracking number format
      if (firstTracking.startsWith('1Z')) {
        trackingLast4 = `UPS #${firstTracking.slice(-4)}`;
      } else if (firstTracking.length === 12 && /^\d+$/.test(firstTracking)) {
        trackingLast4 = `FedEx #${firstTracking.slice(-4)}`;
      } else if (firstTracking.length >= 20) {
        trackingLast4 = `USPS #${firstTracking.slice(-4)}`;
      } else {
        trackingLast4 = `USPS #${firstTracking.slice(-4)}`;
      }
    }
  }
  insertText(`${trackingLast4}\n`);

  // Total Value
  insertText(`VALOR: $${pkg.totalValue.toFixed(2)}\n`);

  // Spacing before images
  insertText('\n');

  // Note about screenshots (actual images would need to be inserted via Drive API)
  if (pkg.screenshotCount && pkg.screenshotCount > 0) {
    insertText(`[${pkg.screenshotCount} product screenshot${pkg.screenshotCount !== 1 ? 's' : ''} attached]\n`);
  }

  return requests;
};

/**
 * Move document to folder
 */
const moveToFolder = async (
  docId: string,
  folderId: string,
  accessToken: string
): Promise<void> => {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${folderId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    // Don't throw error, just log - moving to folder is not critical
    console.warn('Failed to move document to folder');
  }
};

/**
 * Batch create documents for multiple packages
 */
export const batchCreateDocuments = async (
  packages: Package[],
  importer: Importer
): Promise<{
  successful: number;
  failed: number;
  urls: string[];
}> => {
  const urls: string[] = [];
  let successful = 0;
  let failed = 0;

  for (const pkg of packages) {
    const result = await createPackageDocument(pkg, importer);
    if (result.success && result.docUrl) {
      urls.push(result.docUrl);
      successful++;
    } else {
      failed++;
    }
  }

  return { successful, failed, urls };
};

/**
 * Update existing document
 */
export const updatePackageDocument = async (
  pkg: Package,
  docId: string,
  importer: Importer
): Promise<{ success: boolean; error?: string }> => {
  try {
    const accessToken = await getValidAccessToken(importer);
    if (!accessToken) {
      return { success: false, error: 'Google account not connected' };
    }

    // Clear existing content
    await clearDocument(docId, accessToken);

    // Re-format with updated content
    await formatDocument(pkg, docId, accessToken);

    console.log('✓ Updated package document:', docId);
    return { success: true };
  } catch (error) {
    console.error('Failed to update document:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Clear document content
 */
const clearDocument = async (docId: string, accessToken: string): Promise<void> => {
  // Get document to find end index
  const docResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!docResponse.ok) {
    throw new Error('Failed to fetch document');
  }

  const doc = await docResponse.json();
  const endIndex = doc.body.content[doc.body.content.length - 1].endIndex;

  // Delete all content except first character (title)
  await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          deleteContentRange: {
            range: {
              startIndex: 1,
              endIndex: endIndex - 1,
            },
          },
        },
      ],
    }),
  });
};
