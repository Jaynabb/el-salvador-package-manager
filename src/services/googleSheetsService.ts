import type { Package } from '../types';

/**
 * Live Google Sheets integration service
 * Automatically syncs package data to Google Sheets in real-time
 * Perfect for Make.com automation workflows
 */

interface GoogleSheetsRow {
  // Package Info
  packageId: string;
  trackingNumber: string;
  status: string;
  receivedDate: string;
  customsClearedDate: string;
  deliveredDate: string;

  // Customer Info
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;

  // Shipment Details
  origin: string;
  carrier: string;
  totalWeight: number;

  // Items
  itemsCount: number;
  itemsList: string;
  itemsDetails: string;

  // Financial
  totalValue: number;
  customsDuty: number;
  vat: number;
  totalFees: number;
  paymentStatus: string;

  // Customs Declaration
  declaredValue: number;
  declarationCurrency: string;
  declarationPurpose: string;
  certificateOfOrigin: string;
  specialPermitsRequired: string;

  // Additional
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Format package data for Google Sheets
 */
export const formatPackageForSheets = (pkg: Package): GoogleSheetsRow => {
  return {
    // Package Info
    packageId: pkg.id,
    trackingNumber: pkg.trackingNumber,
    status: pkg.status,
    receivedDate: pkg.receivedDate.toISOString(),
    customsClearedDate: pkg.customsClearedDate?.toISOString() || '',
    deliveredDate: pkg.deliveredDate?.toISOString() || '',

    // Customer Info
    customerId: pkg.customerId,
    customerName: pkg.customerName,
    customerPhone: pkg.customerPhone,
    customerEmail: pkg.customerEmail || '',

    // Shipment Details
    origin: pkg.origin,
    carrier: pkg.carrier || '',
    totalWeight: pkg.totalWeight || 0,

    // Items
    itemsCount: pkg.items.length,
    itemsList: pkg.items.map(item => `${item.name} (x${item.quantity})`).join(', '),
    itemsDetails: JSON.stringify(pkg.items),

    // Financial
    totalValue: pkg.totalValue,
    customsDuty: pkg.customsDuty,
    vat: pkg.vat,
    totalFees: pkg.totalFees,
    paymentStatus: pkg.paymentStatus,

    // Customs Declaration
    declaredValue: pkg.customsDeclaration.declaredValue,
    declarationCurrency: pkg.customsDeclaration.currency,
    declarationPurpose: pkg.customsDeclaration.purpose,
    certificateOfOrigin: pkg.customsDeclaration.certificateOfOrigin ? 'Yes' : 'No',
    specialPermitsRequired: pkg.customsDeclaration.specialPermitsRequired ? 'Yes' : 'No',

    // Additional
    notes: pkg.notes || '',
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString()
  };
};

/**
 * Sync a single package to Google Sheets (real-time)
 */
export const syncPackageToGoogleSheets = async (pkg: Package): Promise<{ success: boolean; error?: string }> => {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('Google Sheets webhook URL not configured');
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const data = formatPackageForSheets(pkg);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'addOrUpdatePackage',
        data: data
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    await response.json();
    console.log('✓ Synced to Google Sheets:', pkg.trackingNumber);

    return { success: true };
  } catch (error) {
    console.error('Failed to sync to Google Sheets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Batch sync multiple packages
 */
export const syncMultiplePackagesToGoogleSheets = async (packages: Package[]): Promise<void> => {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('Google Sheets webhook URL not configured');
    throw new Error('Google Sheets webhook URL not configured');
  }

  try {
    const data = packages.map(formatPackageForSheets);

    console.log(`📤 Syncing ${packages.length} packages to Google Sheets...`);
    console.log('Webhook URL:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'batchAddPackages',
        data: data
      })
    });

    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Response:', responseText);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
    }

    console.log(`✓ Batch synced ${packages.length} packages to Google Sheets`);
  } catch (error) {
    console.error('Failed to batch sync to Google Sheets:', error);
    throw error;
  }
};

/**
 * Delete package from Google Sheets
 */
export const deletePackageFromGoogleSheets = async (packageId: string): Promise<void> => {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'deletePackage',
        packageId: packageId
      })
    });

    console.log('✓ Deleted from Google Sheets:', packageId);
  } catch (error) {
    console.error('Failed to delete from Google Sheets:', error);
  }
};

/**
 * Legacy CSV export (backup method)
 */
export const exportPackagesToCSV = (packages: Package[]) => {
  const data = packages.map(formatPackageForSheets);

  const headers = Object.keys(data[0] || {});
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = (row as any)[header];
        const stringValue = String(value);
        return stringValue.includes(',') || stringValue.includes('"')
          ? `"${stringValue.replace(/"/g, '""')}"`
          : stringValue;
      }).join(',')
    )
  ];

  const csv = csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `packages_export_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
