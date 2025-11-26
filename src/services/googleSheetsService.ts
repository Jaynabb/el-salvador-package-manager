import type { Package, Customer } from '../types';

/**
 * Google Sheets integration service for CRM
 * This exports package and customer data to Google Sheets
 *
 * Note: For production use, you'll need to:
 * 1. Create a Google Cloud project
 * 2. Enable Google Sheets API
 * 3. Create API credentials
 * 4. Use Google Sheets API client library or REST API
 *
 * For now, this is a simplified implementation that formats data
 * for export. You can use the Google Sheets API or Apps Script to import.
 */

interface SheetRow {
  [key: string]: string | number | boolean;
}

export const formatPackageForSheets = (pkg: Package): SheetRow => {
  return {
    'Package ID': pkg.id,
    'Tracking Number': pkg.trackingNumber,
    'Customer Name': pkg.customerName,
    'Customer Phone': pkg.customerPhone,
    'Customer Email': pkg.customerEmail || '',
    'Origin': pkg.origin,
    'Carrier': pkg.carrier || '',
    'Status': pkg.status,
    'Received Date': pkg.receivedDate.toLocaleDateString(),
    'Delivered Date': pkg.deliveredDate?.toLocaleDateString() || '',
    'Total Value (USD)': pkg.totalValue,
    'Total Weight (kg)': pkg.totalWeight || 0,
    'Import Duty (USD)': pkg.customsDuty,
    'VAT (USD)': pkg.vat,
    'Total Fees (USD)': pkg.totalFees,
    'Payment Status': pkg.paymentStatus,
    'Items Count': pkg.items.length,
    'Items': pkg.items.map(item => `${item.name} (${item.quantity})`).join(', '),
    'Notes': pkg.notes || ''
  };
};

export const formatCustomerForSheets = (customer: Customer): SheetRow => {
  return {
    'Customer ID': customer.id,
    'Name': customer.name,
    'Phone': customer.phone,
    'Email': customer.email || '',
    'Address': customer.address || '',
    'Created Date': customer.createdAt.toLocaleDateString()
  };
};

/**
 * Generate CSV content for export
 */
export const generateCSV = (data: SheetRow[]): string => {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        const stringValue = String(value);
        // Escape quotes and wrap in quotes if contains comma
        return stringValue.includes(',') || stringValue.includes('"')
          ? `"${stringValue.replace(/"/g, '""')}"`
          : stringValue;
      }).join(',')
    )
  ];

  return csvRows.join('\n');
};

/**
 * Download CSV file
 */
export const downloadCSV = (data: SheetRow[], filename: string) => {
  const csv = generateCSV(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export packages to CSV
 */
export const exportPackagesToCSV = (packages: Package[]) => {
  const data = packages.map(formatPackageForSheets);
  const filename = `packages_export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(data, filename);
};

/**
 * Export customers to CSV
 */
export const exportCustomersToCSV = (customers: Customer[]) => {
  const data = customers.map(formatCustomerForSheets);
  const filename = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(data, filename);
};

/**
 * Future: Direct Google Sheets API integration
 * This would use the Google Sheets API to directly write to a spreadsheet
 */
export const syncToGoogleSheets = async (packages: Package[]) => {
  // TODO: Implement Google Sheets API integration
  // For now, just export to CSV
  console.log('Syncing to Google Sheets...', packages.length, 'packages');
  // This would use the Google Sheets API client
  // to append or update rows in a specific spreadsheet
};
