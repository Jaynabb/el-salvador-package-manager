import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { OrderRow } from '../components/OrderManagement';
import type { Organization } from '../types';

/**
 * Order Export Service
 * Exports orders to Google Docs in the specified format
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

/**
 * Refresh access token using refresh token
 */
const refreshGoogleToken = async (refreshToken: string): Promise<string> => {
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
    const error = await response.json();
    console.error('Token refresh failed:', error);

    // Check if refresh token is invalid/revoked
    if (error.error === 'invalid_grant') {
      throw new Error('Refresh token is invalid or has been revoked. Please reconnect your Google account in Settings.');
    }

    throw new Error(`Failed to refresh token: ${error.error_description || error.error || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('✓ Successfully refreshed Google access token');
  return data.access_token;
};

/**
 * Get valid access token from organization (refresh if needed)
 */
const getValidAccessToken = async (organizationId: string): Promise<string> => {
  console.log('🔍 getValidAccessToken called with organizationId:', organizationId);
  console.log('🔍 Creating document reference...');
  const orgRef = doc(db, 'organizations', organizationId);
  console.log('✓ Document reference created:', orgRef.path);

  try {
    console.log('📖 Attempting to read organization document from Firestore...');
    const orgSnap = await getDoc(orgRef);
    console.log('✓ Organization document read successful, exists:', orgSnap.exists());

    if (!orgSnap.exists()) {
      throw new Error('Organization not found');
    }

    const org = orgSnap.data() as Organization;
    console.log('✓ Organization data parsed:', {
      name: org.organizationName,
      googleConnected: org.googleConnected,
      hasAccessToken: !!org.googleAccessToken
    });

    if (!org.googleConnected || !org.googleAccessToken) {
      throw new Error('Google account not connected. Please connect your Google account in Settings.');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = Date.now();
    let expiryTime: number | null = null;

    if (org.googleTokenExpiry) {
      // Handle both Date objects and Firestore Timestamps
      expiryTime = org.googleTokenExpiry instanceof Date
        ? org.googleTokenExpiry.getTime()
        : (org.googleTokenExpiry as any).toMillis
          ? (org.googleTokenExpiry as any).toMillis()
          : new Date(org.googleTokenExpiry).getTime();
    }

    console.log('🕐 Token expiry check:', {
      hasExpiry: !!expiryTime,
      expiryTime: expiryTime ? new Date(expiryTime).toISOString() : 'none',
      now: new Date(now).toISOString(),
      timeUntilExpiry: expiryTime ? Math.round((expiryTime - now) / 60000) + ' minutes' : 'N/A',
      isExpired: expiryTime ? expiryTime - now < 5 * 60 * 1000 : false
    });

    if (expiryTime && expiryTime - now < 5 * 60 * 1000) {
      // Token expired or about to expire, refresh it
      console.log('⏰ Token expired or expiring soon, refreshing...');

      if (!org.googleRefreshToken) {
        throw new Error('No refresh token available. Please reconnect your Google account in Settings.');
      }

      try {
        const newAccessToken = await refreshGoogleToken(org.googleRefreshToken);
        console.log('✓ Token refreshed successfully');

        // Update in Firestore
        await updateDoc(orgRef, {
          googleAccessToken: newAccessToken,
          googleTokenExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
          updatedAt: new Date(),
        });

        return newAccessToken;
      } catch (error) {
        console.error('❌ Token refresh failed:', error);
        throw error;
      }
    }

    console.log('✓ Using existing token (still valid)');
    return org.googleAccessToken;
  } catch (error) {
    console.error('❌ Error in getValidAccessToken:', error);
    console.error('Error details:', {
      name: (error as any).name,
      message: (error as any).message,
      code: (error as any).code,
      stack: (error as any).stack
    });
    throw error;
  }
};

/**
 * Get the current document length (end index)
 */
const getDocumentEndIndex = async (docId: string, accessToken: string): Promise<number> => {
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get document info');
  }

  const doc = await response.json();
  return doc.body.content[doc.body.content.length - 1].endIndex - 1;
};

/**
 * Create a new Google Doc or append to existing one
 */
const createOrAppendOrderDocument = async (
  orders: OrderRow[],
  accessToken: string,
  organizationId: string,
  folderId?: string
): Promise<{ docId: string; isNew: boolean }> => {
  // Check if there's an active document
  const orgRef = doc(db, 'organizations', organizationId);
  const orgSnap = await getDoc(orgRef);
  const org = orgSnap.data() as Organization;
  const existingDocId = org.activeGoogleDocId;

  let docId: string;
  let isNew = false;
  let startIndex = 1; // Default start index for new documents

  if (existingDocId) {
    // Try to append to existing document
    try {
      // Get the end index of the existing document
      startIndex = await getDocumentEndIndex(existingDocId, accessToken);
      docId = existingDocId;

      // Add separator before new entries
      const separatorRequests = [
        {
          insertText: {
            location: { index: startIndex },
            text: '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n',
          },
        },
      ];

      await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: separatorRequests }),
      });

      // Update startIndex after adding separator
      startIndex = await getDocumentEndIndex(existingDocId, accessToken);

    } catch (error) {
      console.warn('Failed to append to existing document, creating new one:', error);

      // Clear the bad document ID from organization
      await updateDoc(orgRef, {
        activeGoogleDocId: null,
        updatedAt: new Date(),
      });

      // If appending fails, create new document
      docId = await createNewDocument(accessToken, organizationId, folderId);
      isNew = true;
      startIndex = 1;
    }
  } else {
    // No existing document, create new one
    docId = await createNewDocument(accessToken, organizationId, folderId);
    isNew = true;
    startIndex = 1;
  }

  // Build document content (with screenshots)
  const requests = await buildOrderDocumentRequests(orders, accessToken, startIndex);

  // Format the document
  const formatResponse = await fetch(
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

  if (!formatResponse.ok) {
    const error = await formatResponse.json();
    throw new Error(error.error?.message || 'Failed to format document');
  }

  // Update organization with active doc ID
  await updateDoc(orgRef, {
    activeGoogleDocId: docId,
    updatedAt: new Date(),
  });

  return { docId, isNew };
};

/**
 * Create a new Google Doc
 */
const createNewDocument = async (
  accessToken: string,
  organizationId: string,
  folderId?: string
): Promise<string> => {
  // Create document title with date
  const today = new Date().toISOString().split('T')[0];
  const title = `Orders Export - ${today}`;

  // Create the document
  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json();
    throw new Error(error.error?.message || 'Failed to create document');
  }

  const docData = await createResponse.json();
  const docId = docData.documentId;

  // Move to folder if specified
  if (folderId) {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${folderId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  }

  return docId;
};

/**
 * Build document formatting requests for orders
 *
 * Format:
 * [Customer Name]
 * Paquete #[Number]
 * [Carrier]: #[Last 4 tracking]
 * VALOR: $[Total]
 * [Screenshot]
 *
 * [Next order...]
 */
const buildOrderDocumentRequests = async (orders: OrderRow[], accessToken: string, startIndex: number = 1): Promise<any[]> => {
  const requests: any[] = [];
  let index = startIndex; // Start at specified index (for appending)

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

  // Helper to insert image
  // Optimized size: Width 2-3", Height 1-2" to fit multiple screenshots inline
  // 180x135 PT = 2.5" x 1.875" (maintains 4:3 aspect ratio)
  const insertImage = async (imageUrl: string) => {
    requests.push({
      insertInlineImage: {
        location: { index },
        uri: imageUrl,
        objectSize: {
          height: {
            magnitude: 135,
            unit: 'PT',
          },
          width: {
            magnitude: 180,
            unit: 'PT',
          },
        },
      },
    });
    index += 1; // Images take up 1 character position
  };

  // Format each order - SIMPLE format with only 4 fields + screenshots
  // If user manually edits any of these 4 fields in the table, export shows their edits
  for (const [orderIndex, order] of orders.entries()) {
    // 1. Customer Name (bold) - uses exact value from table (order.consignee)
    if (order.consignee) {
      insertBoldText(order.consignee);
      insertText('\n');
    }

    // 2. Package Number - uses exact value from table (order.packageNumber)
    if (order.packageNumber) {
      insertText(`${order.packageNumber}\n`);
    }

    // 3. Carrier + Tracking (last 4 digits) - uses exact values from table
    // Tracking: Uses order.trackingNumber if manually entered, otherwise falls back to merchantTrackingNumber
    // Carrier: Uses order.parcelComp (user can edit this in the table)
    const trackingToUse = order.trackingNumber || order.merchantTrackingNumber || order.orderNumber || '';
    const carrierName = order.parcelComp || '[Carrier]';

    if (trackingToUse) {
      const lastFour = trackingToUse.slice(-4);
      insertText(`${carrierName} #${lastFour}\n`);
    } else {
      insertText('[Carrier] #[----]\n');
    }

    // 4. Value - uses exact value from table (order.value)
    // This reflects any manual edits the user made to the value field
    if (order.value) {
      insertText(`VALOR: $${Number(order.value).toFixed(2)}\n`);
    }

    // 5. Screenshots - insert ALL screenshots for this order
    if (order.screenshotUrls && order.screenshotUrls.length > 0) {
      for (const screenshotUrl of order.screenshotUrls) {
        await insertImage(screenshotUrl);
        insertText(' ');
      }
      insertText('\n');
    }

    // Add spacing between orders
    if (orderIndex < orders.length - 1) {
      insertText('\n');
    }
  }

  return requests;
};

/**
 * Export selected orders to Google Docs (appends to existing or creates new)
 */
export const exportOrdersToGoogleDocs = async (
  orders: OrderRow[],
  organizationId: string,
  exportedBy?: string // User ID who performed the export
): Promise<{ success: boolean; docUrl?: string; error?: string; isNew?: boolean }> => {
  try {
    console.log('📤 Starting export:', { orderCount: orders.length, organizationId, exportedBy });

    if (orders.length === 0) {
      return { success: false, error: 'No orders to export' };
    }

    // Sort orders alphabetically by customer name (first name, then last name)
    // Example: "James Allen" comes before "James Brown"
    // localeCompare() compares the full name character-by-character
    const sortedOrders = [...orders].sort((a, b) => {
      const nameA = (a.consignee || '').toLowerCase().trim();
      const nameB = (b.consignee || '').toLowerCase().trim();
      return nameA.localeCompare(nameB);
    });
    console.log('✓ Orders sorted alphabetically by customer name (first name, then last name)');

    // Get valid access token
    console.log('🔑 Getting access token for organization:', organizationId);
    const accessToken = await getValidAccessToken(organizationId);
    console.log('✓ Access token obtained');

    // Get organization folder ID
    console.log('📁 Getting organization folder ID...');
    const orgRef = doc(db, 'organizations', organizationId);
    const orgSnap = await getDoc(orgRef);
    console.log('✓ Organization data retrieved');
    const org = orgSnap.data() as Organization;
    const folderId = org.googleDriveFolderId;

    // Create or append to document
    const { docId, isNew } = await createOrAppendOrderDocument(sortedOrders, accessToken, organizationId, folderId);

    // Return success with URL
    const docUrl = `https://docs.google.com/document/d/${docId}`;

    // Track export in Firestore for Master Admin retrieval
    try {
      await addDoc(collection(db, 'exportHistory'), {
        docId,
        docUrl,
        organizationId,
        organizationName: org.organizationName,
        orderCount: sortedOrders.length,
        customerNames: [...new Set(sortedOrders.map(o => o.consignee).filter(Boolean))], // Unique customer names (sorted)
        packageNumbers: sortedOrders.map(o => o.packageNumber).filter(Boolean),
        screenshotUrls: sortedOrders.flatMap(o => o.screenshotUrls || []), // All screenshots
        totalValue: sortedOrders.reduce((sum, o) => sum + (o.value || 0), 0),
        exportedBy: exportedBy || 'unknown',
        exportedAt: new Date(),
        isNewDoc: isNew,
      });
    } catch (historyError) {
      console.warn('Failed to save export history:', historyError);
      // Don't fail the export if history tracking fails
    }

    return { success: true, docUrl, isNew };
  } catch (error) {
    console.error('Failed to export orders:', error);

    // Check if it's an authentication error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const isAuthError = errorMessage.includes('authentication') ||
                        errorMessage.includes('Unauthorized') ||
                        errorMessage.includes('invalid authentication');

    if (isAuthError) {
      return {
        success: false,
        error: 'Google account authentication expired. Please go to Settings → Organization and reconnect your Google account.',
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Start a new Google Doc (clears the active doc ID)
 */
export const startNewGoogleDoc = async (organizationId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const orgRef = doc(db, 'organizations', organizationId);
  await updateDoc(orgRef, {
    activeGoogleDocId: null,
    updatedAt: new Date(),
  });
};
