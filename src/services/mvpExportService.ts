import type { Doc, Screenshot, Importer } from '../types';
import { syncPackageToSheet } from './googleSheetsServiceV2';
import { createPackageDocument } from './googleDocsServiceV2';

/**
 * MVP Export Service
 * Handles Google Docs and Google Sheets export in the exact MVP format
 */

/**
 * MVP Google Doc Format:
 *
 * [Customer Name]
 * Paquete #[Number]
 * USPS #[Last 4 tracking]
 * VALOR: $[Total]
 *
 * [Product images/screenshots]
 */
export interface MVPDocData {
  name: string;
  packageNumber: string;
  trackingLast4: string;
  cost: number;
  screenshots?: string[]; // Base64 images to include in doc
}

/**
 * MVP Google Sheet Row Format:
 *
 * PACKAGE # | Date | Consignee | Pieces | Weight (lb) | Tracking Number | COMPANY | VALUE | PARCEL COMP
 */
export interface MVPSheetRow {
  package: string; // Sequential: Paquete #1, Paquete #2
  date: string; // ISO date when first screenshot scanned
  consignee: string; // Customer name
  pieces: number; // Total pieces from all screenshots
  weight: string; // Weight in lb (converted if needed)
  trackingNumber: string; // Outbound tracking number
  company: string; // Detected company (Amazon, Shein, etc.)
  value: number; // Total value of all screenshots
  parcelComp: string; // Parcel/Shipping company (USPS, UPS, FedEx, etc.)
}

/**
 * Generate MVP-formatted Google Doc data from doc and screenshots
 */
export const generateMVPDocData = (doc: Doc, screenshots: Screenshot[]): MVPDocData => {
  // Calculate total cost from all screenshots
  const totalCost = screenshots.reduce((sum, s) =>
    sum + (s.extractedData?.orderTotal || 0), 0
  );

  // Get tracking numbers from screenshots
  const trackingNumbers = screenshots
    .map(s => s.extractedData?.trackingNumber)
    .filter(Boolean);

  // Get last 4 of first tracking number
  let trackingLast4 = 'N/A';
  if (trackingNumbers.length > 0) {
    const firstTracking = trackingNumbers[0]!;
    trackingLast4 = `USPS #${firstTracking.slice(-4)}`;

    // Try to detect carrier from tracking number format
    if (firstTracking.startsWith('1Z')) {
      trackingLast4 = `UPS #${firstTracking.slice(-4)}`;
    } else if (firstTracking.length === 12 && /^\d+$/.test(firstTracking)) {
      trackingLast4 = `FedEx #${firstTracking.slice(-4)}`;
    } else if (firstTracking.length === 22 && firstTracking.startsWith('9')) {
      trackingLast4 = `USPS #${firstTracking.slice(-4)}`;
    }
  } else if (screenshots.length > 0 && screenshots[0].extractedData?.trackingNumberLast4) {
    trackingLast4 = `USPS #${screenshots[0].extractedData.trackingNumberLast4}`;
  }

  return {
    name: doc.customerName || doc.consignee || 'Unnamed Customer',
    packageNumber: doc.packageNumber || 'Paquete #1',
    trackingLast4,
    cost: totalCost
  };
};

/**
 * Generate MVP-formatted Google Sheet row from doc and screenshots
 */
export const generateMVPSheetRow = (doc: Doc, screenshots: Screenshot[]): MVPSheetRow => {
  // Calculate total pieces from all screenshots
  const totalPieces = screenshots.reduce((sum, s) =>
    sum + (s.extractedData?.totalPieces || 0), 0
  );

  // Calculate total value
  const totalValue = screenshots.reduce((sum, s) =>
    sum + (s.extractedData?.orderTotal || 0), 0
  );

  // Detect primary company from screenshots (Amazon, Shein, etc.)
  const companies = screenshots
    .map(s => s.extractedData?.company)
    .filter(Boolean);
  const primaryCompany = companies[0] || 'Unknown';

  // Get date arrived (when first screenshot was scanned)
  const dateArrived = doc.dateArrived || doc.createdAt;

  // Convert weight to lb if needed
  let weightLb = '';
  if (doc.weight) {
    const weight = doc.weight;
    const unit = doc.weightUnit || 'kg';
    if (unit === 'lb') {
      weightLb = weight.toString();
    } else if (unit === 'kg') {
      // Convert kg to lb (1 kg = 2.20462 lb)
      weightLb = (weight * 2.20462).toFixed(2);
    } else {
      weightLb = weight.toString();
    }
  }

  // Detect parcel company from tracking number
  let parcelComp = '';
  const trackingNumber = doc.outboundTrackingNumber || '';
  if (trackingNumber) {
    if (trackingNumber.startsWith('1Z')) {
      parcelComp = 'UPS';
    } else if (trackingNumber.length === 12 && /^\d+$/.test(trackingNumber)) {
      parcelComp = 'FedEx';
    } else if (trackingNumber.length === 22 && trackingNumber.startsWith('9')) {
      parcelComp = 'USPS';
    } else if (trackingNumber.length === 20 && /^\d+$/.test(trackingNumber)) {
      parcelComp = 'USPS';
    } else {
      parcelComp = 'Other';
    }
  }

  return {
    package: doc.packageNumber || 'Paquete #1',
    date: dateArrived.toISOString().split('T')[0], // YYYY-MM-DD format
    consignee: doc.customerName || doc.consignee || 'Unknown',
    pieces: totalPieces,
    weight: weightLb,
    trackingNumber: trackingNumber,
    company: primaryCompany,
    value: totalValue,
    parcelComp: parcelComp
  };
};

/**
 * Format MVP Google Doc as plain text (for demo/preview)
 */
export const formatMVPDocAsText = (docData: MVPDocData): string => {
  const lines = [
    docData.name,
    docData.packageNumber,
    docData.trackingLast4,
    `VALOR: $${docData.cost.toFixed(2)}`
  ];

  if (docData.screenshots && docData.screenshots.length > 0) {
    lines.push('');
    lines.push(`[${docData.screenshots.length} product image${docData.screenshots.length !== 1 ? 's' : ''} attached]`);
  }

  return lines.join('\n');
};

/**
 * Export doc to Google Docs in MVP format
 * Returns the Google Doc URL
 */
export const exportToMVPGoogleDoc = async (
  doc: Doc,
  screenshots: Screenshot[]
): Promise<string | null> => {
  const CLOUD_FUNCTION_URL = import.meta.env.VITE_GOOGLE_DOCS_FUNCTION_URL;

  if (!CLOUD_FUNCTION_URL) {
    console.warn('⚠️ Google Docs Cloud Function URL not configured.');
    console.log('📄 MVP Google Doc Export (Demo Mode)');

    const mvpData = generateMVPDocData(doc, screenshots);
    console.log(formatMVPDocAsText(mvpData));

    return `https://docs.google.com/document/d/MVP_DEMO_${doc.id}/edit`;
  }

  try {
    const mvpData = generateMVPDocData(doc, screenshots);

    const response = await fetch(`${CLOUD_FUNCTION_URL}/createMVPDoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docData: mvpData,
        organizationId: doc.organizationId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('✓ MVP Google Doc created:', result.docUrl);
    return result.docUrl;
  } catch (error) {
    console.error('Error creating MVP Google Doc:', error);
    return null;
  }
};

/**
 * Export doc to Google Sheets in MVP format
 * Returns the Google Sheet URL or success status
 */
export const exportToMVPGoogleSheet = async (
  doc: Doc,
  screenshots: Screenshot[]
): Promise<{ success: boolean; sheetUrl?: string; error?: string }> => {
  const WEBHOOK_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    console.warn('⚠️ Google Sheets webhook URL not configured.');
    console.log('📊 MVP Google Sheet Export (Demo Mode)');

    const mvpRow = generateMVPSheetRow(doc, screenshots);
    console.table([mvpRow]);

    return {
      success: true,
      sheetUrl: `https://docs.google.com/spreadsheets/d/MVP_DEMO_${doc.id}/edit`
    };
  }

  try {
    const mvpRow = generateMVPSheetRow(doc, screenshots);

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addMVPRow',
        data: mvpRow
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('✓ MVP Google Sheet row added');

    return {
      success: true,
      sheetUrl: result.sheetUrl
    };
  } catch (error) {
    console.error('Error exporting to MVP Google Sheet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Complete MVP export: Both Google Doc and Google Sheet
 * Now supports Google OAuth integration for automated exports
 */
export const completeMVPExport = async (
  doc: Doc,
  screenshots: Screenshot[],
  importer?: Importer
): Promise<{
  success: boolean;
  docUrl?: string;
  sheetUrl?: string;
  errors: string[];
}> => {
  const errors: string[] = [];
  let docUrl: string | undefined;
  let sheetUrl: string | undefined;

  // Check if importer has Google OAuth connected
  const useOAuthExport = importer?.googleConnected && importer?.googleAccessToken;

  if (useOAuthExport) {
    console.log('✓ Using Google OAuth for automated export');

    // Create package object from doc and screenshots for V2 services
    const packageData = convertDocToPackage(doc, screenshots);

    // Export to Google Doc using OAuth
    try {
      const result = await createPackageDocument(packageData, importer!);
      if (result.success && result.docUrl) {
        docUrl = result.docUrl;
      } else {
        errors.push(result.error || 'Failed to create Google Doc');
      }
    } catch (error) {
      errors.push(`Google Doc error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Export to Google Sheet using OAuth
    try {
      const result = await syncPackageToSheet(packageData, importer!);
      if (result.success && importer?.googleSheetId) {
        sheetUrl = `https://docs.google.com/spreadsheets/d/${importer.googleSheetId}`;
      } else {
        errors.push(result.error || 'Failed to export to Google Sheet');
      }
    } catch (error) {
      errors.push(`Google Sheet error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  } else {
    console.log('⚠️ Using legacy webhook export (OAuth not connected)');

    // Export to Google Doc (legacy)
    try {
      const url = await exportToMVPGoogleDoc(doc, screenshots);
      if (url) {
        docUrl = url;
      } else {
        errors.push('Failed to create Google Doc');
      }
    } catch (error) {
      errors.push(`Google Doc error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Export to Google Sheet (legacy)
    try {
      const result = await exportToMVPGoogleSheet(doc, screenshots);
      if (result.success) {
        sheetUrl = result.sheetUrl;
      } else {
        errors.push(result.error || 'Failed to export to Google Sheet');
      }
    } catch (error) {
      errors.push(`Google Sheet error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return {
    success: errors.length === 0,
    docUrl,
    sheetUrl,
    errors
  };
};

/**
 * Convert Doc and Screenshots to Package format for V2 services
 */
const convertDocToPackage = (doc: Doc, screenshots: Screenshot[]): any => {
  // Calculate totals
  const totalValue = screenshots.reduce((sum, s) => sum + (s.extractedData?.orderTotal || 0), 0);
  const totalPieces = screenshots.reduce((sum, s) => sum + (s.extractedData?.totalPieces || 0), 0);

  // Get tracking numbers
  const trackingNumbers = screenshots
    .map(s => s.extractedData?.trackingNumber)
    .filter(Boolean) as string[];

  // Get all items from all screenshots
  const allItems = screenshots.flatMap(s => s.extractedData?.items || []);

  // Detect company
  const companies = screenshots.map(s => s.extractedData?.company).filter(Boolean);
  const primaryCompany = companies[0] || 'Unknown';

  return {
    id: doc.id,
    packageNumber: doc.packageNumber || 'Paquete #1',
    trackingNumbers: trackingNumbers.length > 0 ? trackingNumbers : ['N/A'],
    importerId: doc.importerId,
    customerId: 'temp-customer-id', // Not used in doc/sheet export
    customerName: doc.customerName || doc.consignee || 'Unknown',
    customerPhone: 'N/A',
    customerEmail: '',
    items: allItems,
    totalValue,
    totalWeight: doc.weight || 0,
    origin: primaryCompany,
    carrier: '',
    screenshotCount: screenshots.length,
    screenshotIds: doc.screenshotIds,
    customsDeclaration: {
      declaredValue: totalValue,
      currency: 'USD',
      purpose: 'personal' as const,
      estimatedDuty: 0,
      estimatedVAT: 0
    },
    status: 'received' as const,
    receivedDate: doc.dateArrived || new Date(),
    customsDuty: 0,
    vat: 0,
    totalFees: 0,
    paymentStatus: 'pending' as const,
    notes: `Auto-generated from doc ${doc.id}. Total pieces: ${totalPieces}`,
    createdAt: doc.createdAt || new Date(),
    updatedAt: new Date()
  };
};
