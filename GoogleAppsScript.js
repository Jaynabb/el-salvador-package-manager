/**
 * Google Apps Script for ImportFlow Real-Time Sheet Sync
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete the default code and paste this entire file
 * 4. Click "Deploy" > "New deployment"
 * 5. Select "Web app" as deployment type
 * 6. Set "Execute as" to "Me"
 * 7. Set "Who has access" to "Anyone"
 * 8. Click "Deploy" and copy the Web App URL
 * 9. Add the URL to your .env.local as VITE_GOOGLE_SHEETS_WEBHOOK_URL
 * 10. Go back to your spreadsheet - it will now auto-populate!
 */

// Sheet name - edit this if you want a different name
const SHEET_NAME = 'ImportFlow Packages';

// Column headers - DO NOT MODIFY unless you change the data structure
const HEADERS = [
  'Package ID',
  'Tracking Number',
  'Status',
  'Received Date',
  'Customs Cleared Date',
  'Delivered Date',
  'Customer ID',
  'Customer Name',
  'Customer Phone',
  'Customer Email',
  'Origin',
  'Carrier',
  'Total Weight (kg)',
  'Items Count',
  'Items List',
  'Items Details (JSON)',
  'Total Value (USD)',
  'Customs Duty (USD)',
  'VAT (USD)',
  'Total Fees (USD)',
  'Payment Status',
  'Declared Value (USD)',
  'Currency',
  'Declaration Purpose',
  'Certificate of Origin',
  'Special Permits Required',
  'Notes',
  'Created At',
  'Updated At'
];

/**
 * Initialize the sheet with headers if it doesn't exist
 */
function initializeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);

    // Auto-resize columns
    for (let i = 1; i <= HEADERS.length; i++) {
      sheet.autoResizeColumn(i);
    }
  }

  return sheet;
}

/**
 * Handle OPTIONS request for CORS preflight
 */
function doOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
}

/**
 * Main webhook handler - receives POST requests from ImportFlow
 */
function doPost(e) {
  try {
    const sheet = initializeSheet();
    const data = JSON.parse(e.postData.contents);

    switch (data.action) {
      case 'addOrUpdatePackage':
        addOrUpdatePackage(sheet, data.data);
        break;

      case 'batchAddPackages':
        batchAddPackages(sheet, data.data);
        break;

      case 'deletePackage':
        deletePackage(sheet, data.packageId);
        break;

      default:
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Unknown action'
        }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeaders({
          'Access-Control-Allow-Origin': '*'
        });
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data synced successfully'
    }))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*'
    });

  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*'
    });
  }
}

/**
 * Add or update a single package
 */
function addOrUpdatePackage(sheet, packageData) {
  const packageId = packageData.packageId;
  const data = sheet.getDataRange().getValues();

  // Find existing row
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === packageId) {
      rowIndex = i + 1; // +1 because array is 0-indexed but sheet is 1-indexed
      break;
    }
  }

  // Prepare row data
  const rowData = [
    packageData.packageId,
    packageData.trackingNumber,
    packageData.status,
    packageData.receivedDate,
    packageData.customsClearedDate,
    packageData.deliveredDate,
    packageData.customerId,
    packageData.customerName,
    packageData.customerPhone,
    packageData.customerEmail,
    packageData.origin,
    packageData.carrier,
    packageData.totalWeight,
    packageData.itemsCount,
    packageData.itemsList,
    packageData.itemsDetails,
    packageData.totalValue,
    packageData.customsDuty,
    packageData.vat,
    packageData.totalFees,
    packageData.paymentStatus,
    packageData.declaredValue,
    packageData.declarationCurrency,
    packageData.declarationPurpose,
    packageData.certificateOfOrigin,
    packageData.specialPermitsRequired,
    packageData.notes,
    packageData.createdAt,
    packageData.updatedAt
  ];

  if (rowIndex > 0) {
    // Update existing row
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Add new row
    sheet.appendRow(rowData);
  }

  Logger.log('Package synced: ' + packageData.trackingNumber);
}

/**
 * Batch add multiple packages
 */
function batchAddPackages(sheet, packagesData) {
  packagesData.forEach(function(packageData) {
    addOrUpdatePackage(sheet, packageData);
  });
  Logger.log('Batch synced ' + packagesData.length + ' packages');
}

/**
 * Delete a package from the sheet
 */
function deletePackage(sheet, packageId) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === packageId) {
      sheet.deleteRow(i + 1);
      Logger.log('Package deleted: ' + packageId);
      return;
    }
  }
}

/**
 * Test function - run this to verify the script works
 */
function test() {
  const testData = {
    packageId: 'test123',
    trackingNumber: 'TEST123456',
    status: 'received',
    receivedDate: new Date().toISOString(),
    customsClearedDate: '',
    deliveredDate: '',
    customerId: 'cust123',
    customerName: 'Test Customer',
    customerPhone: '+503 1234-5678',
    customerEmail: 'test@example.com',
    origin: 'United States',
    carrier: 'DHL',
    totalWeight: 2.5,
    itemsCount: 3,
    itemsList: 'iPhone (x1), Headphones (x2)',
    itemsDetails: '[{"name":"iPhone","quantity":1}]',
    totalValue: 500,
    customsDuty: 75,
    vat: 74.75,
    totalFees: 149.75,
    paymentStatus: 'pending',
    declaredValue: 500,
    declarationCurrency: 'USD',
    declarationPurpose: 'personal',
    certificateOfOrigin: 'No',
    specialPermitsRequired: 'No',
    notes: 'Test package',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const sheet = initializeSheet();
  addOrUpdatePackage(sheet, testData);
  Logger.log('Test completed! Check your sheet.');
}
