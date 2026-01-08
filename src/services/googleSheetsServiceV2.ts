import type { Package, Importer } from '../types';
import { getValidAccessToken } from './googleOAuthService';

/**
 * Google Sheets Service V2 - OAuth Edition
 * Uses Google Sheets API directly with OAuth tokens
 * No webhook or Apps Script setup required
 */

interface SheetRow {
  packageId: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  status: string;
  totalValue: number;
  totalWeight: number;
  origin: string;
  carrier: string;
  itemsCount: number;
  itemsList: string;
  receivedDate: string;
  customsClearedDate: string;
  deliveredDate: string;
  customsDuty: number;
  vat: number;
  totalFees: number;
  paymentStatus: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert package to sheet row format
 */
const formatPackageForSheet = (pkg: Package): SheetRow => {
  return {
    packageId: pkg.id,
    trackingNumber: pkg.trackingNumbers?.[0] || pkg.trackingNumbers?.join(', ') || '',
    customerName: pkg.customerName,
    customerPhone: pkg.customerPhone,
    customerEmail: pkg.customerEmail || '',
    status: pkg.status,
    totalValue: pkg.totalValue,
    totalWeight: pkg.totalWeight || 0,
    origin: pkg.origin || '',
    carrier: pkg.carrier || '',
    itemsCount: pkg.items.length,
    itemsList: pkg.items.map(item => `${item.name} (x${item.quantity})`).join(', '),
    receivedDate: pkg.receivedDate?.toISOString() || '',
    customsClearedDate: pkg.customsClearedDate?.toISOString() || '',
    deliveredDate: pkg.deliveredDate?.toISOString() || '',
    customsDuty: pkg.customsDuty,
    vat: pkg.vat,
    totalFees: pkg.totalFees,
    paymentStatus: pkg.paymentStatus,
    notes: pkg.notes || '',
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
};

/**
 * Convert row object to array of values matching header order
 */
const rowToValues = (row: SheetRow): any[] => {
  return [
    row.packageId,
    row.trackingNumber,
    row.customerName,
    row.customerPhone,
    row.customerEmail,
    row.status,
    row.totalValue,
    row.totalWeight,
    row.origin,
    row.carrier,
    row.itemsCount,
    row.itemsList,
    row.receivedDate,
    row.customsClearedDate,
    row.deliveredDate,
    row.customsDuty,
    row.vat,
    row.totalFees,
    row.paymentStatus,
    row.notes,
    row.createdAt,
    row.updatedAt,
  ];
};

/**
 * Sync package to Google Sheets using OAuth
 */
export const syncPackageToSheet = async (
  pkg: Package,
  importer: Importer
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Get valid access token
    const accessToken = await getValidAccessToken(importer);
    if (!accessToken) {
      return { success: false, error: 'Google account not connected' };
    }

    if (!importer.googleSheetId) {
      return { success: false, error: 'No tracking sheet configured' };
    }

    // Format package data
    const rowData = formatPackageForSheet(pkg);
    const values = rowToValues(rowData);

    // Check if package already exists in sheet
    const existingRowIndex = await findPackageRow(
      importer.googleSheetId,
      pkg.id,
      accessToken
    );

    if (existingRowIndex !== null) {
      // Update existing row
      await updateSheetRow(
        importer.googleSheetId,
        existingRowIndex,
        values,
        accessToken
      );
    } else {
      // Append new row
      await appendSheetRow(
        importer.googleSheetId,
        values,
        accessToken
      );
    }

    console.log('✓ Synced package to Google Sheets:', pkg.id);
    return { success: true };
  } catch (error) {
    console.error('Failed to sync package to Sheets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Find package row in sheet by package ID
 */
const findPackageRow = async (
  sheetId: string,
  packageId: string,
  accessToken: string
): Promise<number | null> => {
  try {
    // Get all package IDs from column A
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Packages!A:A`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to read sheet');
    }

    const data = await response.json();
    const values = data.values || [];

    // Find row with matching package ID (skip header row)
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === packageId) {
        return i + 1; // Return 1-based row number
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding package row:', error);
    return null;
  }
};

/**
 * Update existing row in sheet
 */
const updateSheetRow = async (
  sheetId: string,
  rowIndex: number,
  values: any[],
  accessToken: string
): Promise<void> => {
  const range = `Packages!A${rowIndex}:V${rowIndex}`; // Adjust column range as needed

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [values],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update row');
  }
};

/**
 * Append new row to sheet
 */
const appendSheetRow = async (
  sheetId: string,
  values: any[],
  accessToken: string
): Promise<void> => {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Packages!A:V:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [values],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to append row');
  }
};

/**
 * Delete package from sheet
 */
export const deletePackageFromSheet = async (
  packageId: string,
  importer: Importer
): Promise<{ success: boolean; error?: string }> => {
  try {
    const accessToken = await getValidAccessToken(importer);
    if (!accessToken || !importer.googleSheetId) {
      return { success: false, error: 'Google account not connected' };
    }

    const rowIndex = await findPackageRow(
      importer.googleSheetId,
      packageId,
      accessToken
    );

    if (rowIndex === null) {
      return { success: true }; // Already deleted or never existed
    }

    // Delete the row using batchUpdate
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${importer.googleSheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: 0, // Assumes first sheet, adjust if needed
                  dimension: 'ROWS',
                  startIndex: rowIndex - 1, // 0-based for API
                  endIndex: rowIndex,
                },
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to delete row');
    }

    console.log('✓ Deleted package from sheet:', packageId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete package from sheet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Batch sync multiple packages
 */
export const batchSyncPackagesToSheet = async (
  packages: Package[],
  importer: Importer
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;

  for (const pkg of packages) {
    const result = await syncPackageToSheet(pkg, importer);
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return { successful, failed };
};

/**
 * Get tracking sheet URL
 */
export const getTrackingSheetUrl = (importer: Importer): string | null => {
  if (!importer.googleSheetId) {
    return null;
  }
  return `https://docs.google.com/spreadsheets/d/${importer.googleSheetId}`;
};
