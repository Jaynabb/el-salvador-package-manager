import type { Package } from '../types';

/**
 * Google Docs Service - Creates and manages Google Docs for packages
 * Calls Firebase Cloud Function to create documents
 */

const CLOUD_FUNCTION_URL = import.meta.env.VITE_GOOGLE_DOCS_FUNCTION_URL || '';

/**
 * Create a Google Doc for a package
 * Calls the Firebase Cloud Function which creates the document
 */
export const createPackageDocument = async (pkg: Package): Promise<string | null> => {
  if (!CLOUD_FUNCTION_URL) {
    console.warn('⚠️ Google Docs Cloud Function URL not configured.');
    console.warn('To enable Google Docs export, add VITE_GOOGLE_DOCS_FUNCTION_URL to your .env.local file.');
    return null;
  }

  try {
    const response = await fetch(`${CLOUD_FUNCTION_URL}/createPackageDoc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        packageData: {
          id: pkg.id,
          trackingNumber: pkg.trackingNumber,
          customerId: pkg.customerId,
          customerName: pkg.customerName,
          customerPhone: pkg.customerPhone,
          customerEmail: pkg.customerEmail,
          items: pkg.items,
          totalValue: pkg.totalValue,
          totalWeight: pkg.totalWeight,
          origin: pkg.origin,
          carrier: pkg.carrier,
          customsDeclaration: pkg.customsDeclaration,
          status: pkg.status,
          receivedDate: pkg.receivedDate,
          customsClearedDate: pkg.customsClearedDate,
          deliveredDate: pkg.deliveredDate,
          customsDuty: pkg.customsDuty,
          vat: pkg.vat,
          handlingFee: pkg.handlingFee,
          totalFees: pkg.totalFees,
          paymentStatus: pkg.paymentStatus,
          notes: pkg.notes,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✓ Google Doc created:', data.docUrl);
    return data.docUrl;
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    return null;
  }
};

/**
 * Export multiple packages to Google Docs
 * Creates one document per package
 */
export const exportPackagesToGoogleDocs = async (packages: Package[]): Promise<{
  successful: number;
  failed: number;
  urls: string[];
}> => {
  const urls: string[] = [];
  let successful = 0;
  let failed = 0;

  for (const pkg of packages) {
    try {
      const url = await createPackageDocument(pkg);
      if (url) {
        urls.push(url);
        successful++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to create doc for package ${pkg.trackingNumber}:`, error);
      failed++;
    }
  }

  return { successful, failed, urls };
};
