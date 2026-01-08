import type { Batch, Screenshot } from '../types';

/**
 * Batch Export Service - Exports batch data to Google Docs
 */

const CLOUD_FUNCTION_URL = import.meta.env.VITE_GOOGLE_DOCS_FUNCTION_URL || '';

export interface BatchExportData {
  docId: string;
  customerName: string;
  weight?: number;
  weightUnit?: 'kg' | 'lb';
  screenshotCount: number;
  totalValue: number;
  trackingNumbers: string[];
  screenshots: Array<{
    screenshotNumber: number;
    source: 'whatsapp' | 'manual';
    trackingNumber?: string;
    orderTotal: number;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    // Include actual screenshot images for customs verification
    imageBase64: string;
    imageType: string;
    uploadedAt?: Date;
    extractionStatus?: 'pending' | 'processing' | 'completed' | 'error';
  }>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Export a batch to Google Docs
 */
export const exportDocToGoogleDoc = async (
  batch: Doc,
  screenshots: Screenshot[]
): Promise<string | null> => {
  if (!CLOUD_FUNCTION_URL) {
    console.warn('⚠️ Google Docs Cloud Function URL not configured.');
    console.warn('To enable Google Docs export, add VITE_GOOGLE_DOCS_FUNCTION_URL to your .env.local file.');

    // Return demo doc URL for testing
    return generateMockBatchDocument(batch, screenshots);
  }

  try {
    // Calculate totals
    const totalValue = screenshots.reduce((sum, s) =>
      sum + (s.extractedData?.orderTotal || 0), 0
    );

    const trackingNumbers = screenshots
      .map(s => s.extractedData?.trackingNumber)
      .filter((tn): tn is string => !!tn);

    // Format screenshot data - INCLUDE ACTUAL IMAGES
    const screenshotData = screenshots.map((s, index) => ({
      screenshotNumber: index + 1,
      source: s.source,
      trackingNumber: s.extractedData?.trackingNumber,
      orderTotal: s.extractedData?.orderTotal || 0,
      items: s.extractedData?.items || [],
      // Include the actual screenshot image for customs verification
      imageBase64: s.imageBase64,
      imageType: s.imageType,
      uploadedAt: s.uploadedAt,
      extractionStatus: s.extractionStatus
    }));

    const exportData: BatchExportData = {
      docId: batch.id,
      customerName: batch.customerName || 'Unnamed Customer',
      weight: batch.weight,
      weightUnit: batch.weightUnit,
      screenshotCount: screenshots.length,
      totalValue,
      trackingNumbers,
      screenshots: screenshotData,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt
    };

    // Prepare data for Google Docs with screenshots
    const docData = {
      action: 'exportBatchDocument',
      data: {
        docId: batch.id,
        batchName: batch.customerName || 'Unnamed Batch',
        exportDate: new Date().toISOString(),
        organizationId: batch.organizationId,
        screenshots: screenshots.map((s, index) => ({
          screenshotNumber: index + 1,
          imageBase64: s.imageBase64,
          imageType: s.imageType,
          source: s.source,
          uploadedAt: s.uploadedAt,
          extractionStatus: s.extractionStatus,
          extractedData: s.extractedData
        }))
      }
    };

    const response = await fetch(`${CLOUD_FUNCTION_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(docData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✓ Batch exported to Google Doc:', data.docUrl);
    return data.docUrl;
  } catch (error) {
    console.error('Error exporting batch to Google Doc:', error);
    return null;
  }
};

/**
 * Generate a mock document URL for demo purposes
 */
function generateMockBatchDocument(batch: Doc, screenshots: Screenshot[]): string {
  const totalValue = screenshots.reduce((sum, s) =>
    sum + (s.extractedData?.orderTotal || 0), 0
  );

  const trackingNumbers = screenshots
    .map(s => s.extractedData?.trackingNumber)
    .filter(Boolean);

  // Create a formatted document preview in console
  console.log('📄 BATCH EXPORT DOCUMENT (Demo Mode)');
  console.log('=====================================');
  console.log(`Customer: ${batch.customerName || 'Unnamed'}`);
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Created: ${batch.createdAt.toLocaleString()}`);
  console.log('');
  console.log('SUMMARY');
  console.log('-------');
  console.log(`Total Orders: ${screenshots.length}`);
  console.log(`Total Value: $${totalValue.toFixed(2)}`);
  console.log(`Weight: ${batch.weight || 'Not specified'} ${batch.weightUnit || ''}`);
  console.log(`Tracking Numbers: ${trackingNumbers.length}`);
  console.log('');
  console.log('ORDER DETAILS');
  console.log('-------------');

  screenshots.forEach((screenshot, index) => {
    console.log(`\nOrder #${index + 1}`);
    console.log(`Source: ${screenshot.source === 'whatsapp' ? '📱 WhatsApp' : '💻 Manual'}`);
    console.log(`Screenshot: ${screenshot.imageBase64 ? '✓ Included' : '✗ Missing'}`);
    console.log(`Tracking: ${screenshot.extractedData?.trackingNumber || 'N/A'}`);

    screenshot.extractedData?.items.forEach(item => {
      console.log(`  - ${item.name}: ${item.quantity} × $${item.unitValue.toFixed(2)} = $${item.totalValue.toFixed(2)}`);
    });

    console.log(`  Order Total: $${screenshot.extractedData?.orderTotal || 0}`);
  });

  console.log('');
  console.log('ALL TRACKING NUMBERS');
  console.log('-------------------');
  trackingNumbers.forEach((tn, i) => {
    console.log(`${i + 1}. ${tn}`);
  });
  console.log('=====================================');

  // Return a mock Google Docs URL
  return `https://docs.google.com/document/d/DEMO_${batch.id}/edit`;
}

/**
 * Export multiple docs to Google Docs
 */
export const exportBatchesToGoogleDocs = async (
  docs: Array<{ batch: Doc; screenshots: Screenshot[] }>
): Promise<{
  successful: number;
  failed: number;
  urls: string[];
}> => {
  const urls: string[] = [];
  let successful = 0;
  let failed = 0;

  for (const { batch, screenshots } of docs) {
    try {
      const url = await exportDocToGoogleDoc(batch, screenshots);
      if (url) {
        urls.push(url);
        successful++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to export batch ${batch.id}:`, error);
      failed++;
    }
  }

  return { successful, failed, urls };
};

/**
 * Export batch data to Google Sheets (all AI extracted info)
 */
export const exportBatchToGoogleSheets = async (
  batch: Doc,
  screenshots: Screenshot[]
): Promise<string | null> => {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('⚠️ Google Sheets webhook URL not configured.');
    console.log('📊 Batch data would be exported to Google Sheets (demo mode)');
    return `https://docs.google.com/spreadsheets/d/DEMO_${batch.id}/edit`;
  }

  try {
    // Prepare comprehensive data for sheets
    const sheetData = {
      batchInfo: {
        id: batch.id,
        name: batch.customerName || 'Unnamed Batch',
        weight: batch.weight,
        weightUnit: batch.weightUnit,
        screenshotCount: screenshots.length,
        createdAt: batch.createdAt.toISOString(),
        status: batch.status
      },
      orders: screenshots.map((screenshot, index) => ({
        orderNumber: index + 1,
        screenshotId: screenshot.id,
        source: screenshot.source,
        uploadedAt: screenshot.uploadedAt?.toISOString(),
        extractionStatus: screenshot.extractionStatus,
        trackingNumber: screenshot.extractedData?.trackingNumber || '',
        orderNumber: screenshot.extractedData?.orderNumber || '',
        seller: screenshot.extractedData?.seller || '',
        orderDate: screenshot.extractedData?.orderDate || '',
        orderTotal: screenshot.extractedData?.orderTotal || 0,
        items: screenshot.extractedData?.items?.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitValue: item.unitValue,
          totalValue: item.totalValue,
          hsCode: item.hsCode || '',
          weight: item.weight || 0,
          category: item.category || ''
        })) || []
      }))
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'exportBatchToSheets',
        data: sheetData
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✓ Batch exported to Google Sheets:', result.sheetUrl);
    return result.sheetUrl;
  } catch (error) {
    console.error('Error exporting batch to Google Sheets:', error);
    return null;
  }
};

/**
 * Delivery options for batch exports
 */
export interface DeliveryOptions {
  method: 'whatsapp' | 'sms' | 'email';
  recipient: string; // Phone number or email
  documentUrl: string;
  sheetUrl?: string;
  batchName: string;
}

/**
 * Deliver batch export via WhatsApp, SMS, or Email
 */
export const deliverBatchExport = async (options: DeliveryOptions): Promise<boolean> => {
  const deliveryWebhookUrl = import.meta.env.VITE_DELIVERY_WEBHOOK_URL;

  if (!deliveryWebhookUrl) {
    console.warn('⚠️ Delivery webhook URL not configured.');
    console.log(`📤 Would deliver ${options.method} to ${options.recipient}:`);
    console.log(`  Document: ${options.documentUrl}`);
    if (options.sheetUrl) {
      console.log(`  Sheet: ${options.sheetUrl}`);
    }
    return true;
  }

  try {
    const message = formatDeliveryMessage(options);

    const payload = {
      action: 'deliverBatchExport',
      method: options.method,
      recipient: options.recipient,
      message,
      documentUrl: options.documentUrl,
      sheetUrl: options.sheetUrl
    };

    const response = await fetch(deliveryWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`✓ Batch delivered via ${options.method} to ${options.recipient}`);
    return true;
  } catch (error) {
    console.error('Error delivering batch export:', error);
    return false;
  }
};

/**
 * Format delivery message based on method
 */
function formatDeliveryMessage(options: DeliveryOptions): string {
  if (options.method === 'email') {
    return `
Your batch "${options.batchName}" has been exported and is ready for download.

📄 Customs Document: ${options.documentUrl}
${options.sheetUrl ? `📊 Data Spreadsheet: ${options.sheetUrl}` : ''}

This document contains all the information needed for customs processing.

Best regards,
ImportFlow Team
    `.trim();
  }

  // WhatsApp/SMS format
  return `
✅ *Batch Export Ready*

📦 Batch: ${options.batchName}

📄 Document: ${options.documentUrl}
${options.sheetUrl ? `📊 Spreadsheet: ${options.sheetUrl}` : ''}

Your customs document is ready for download.
  `.trim();
}

/**
 * Complete export process with delivery
 */
export const exportAndDeliverBatch = async (
  batch: Doc,
  screenshots: Screenshot[],
  deliveryMethod: 'whatsapp' | 'sms' | 'email' | 'download',
  recipient?: string
): Promise<{
  success: boolean;
  documentUrl?: string;
  sheetUrl?: string;
  message: string;
}> => {
  try {
    // Export to Google Docs
    const documentUrl = await exportDocToGoogleDoc(batch, screenshots);
    if (!documentUrl) {
      return {
        success: false,
        message: 'Failed to export batch document'
      };
    }

    // Export to Google Sheets
    const sheetUrl = await exportBatchToGoogleSheets(batch, screenshots);

    // If delivery method is not download, deliver the export
    if (deliveryMethod !== 'download' && recipient) {
      const delivered = await deliverBatchExport({
        method: deliveryMethod,
        recipient,
        documentUrl,
        sheetUrl: sheetUrl || undefined,
        batchName: batch.customerName || batch.id
      });

      if (!delivered) {
        return {
          success: false,
          documentUrl,
          sheetUrl: sheetUrl || undefined,
          message: 'Export succeeded but delivery failed'
        };
      }

      return {
        success: true,
        documentUrl,
        sheetUrl: sheetUrl || undefined,
        message: `Batch exported and delivered via ${deliveryMethod}`
      };
    }

    return {
      success: true,
      documentUrl,
      sheetUrl: sheetUrl || undefined,
      message: 'Batch exported successfully'
    };
  } catch (error) {
    console.error('Error in exportAndDeliverBatch:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Export failed'
    };
  }
};
