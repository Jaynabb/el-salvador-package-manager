import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { OrderRow } from '../components/OrderManagement';
import type { Organization } from '../types';

/**
 * Order Sheets Export Service
 * Exports orders to Google Sheets with line-item level detail (one row per item)
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
  const orgRef = doc(db, 'organizations', organizationId);
  const orgSnap = await getDoc(orgRef);

  if (!orgSnap.exists()) {
    throw new Error('Organization not found');
  }

  const org = orgSnap.data() as Organization;

  if (!org.googleConnected || !org.googleAccessToken) {
    throw new Error('Google account not connected. Please connect your Google account in Settings.');
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const now = Date.now();
  let expiryTime: number | null = null;

  if (org.googleTokenExpiry) {
    expiryTime = org.googleTokenExpiry instanceof Date
      ? org.googleTokenExpiry.getTime()
      : (org.googleTokenExpiry as any).toMillis
        ? (org.googleTokenExpiry as any).toMillis()
        : new Date(org.googleTokenExpiry).getTime();
  }

  if (expiryTime && expiryTime - now < 5 * 60 * 1000) {
    // Token expired or about to expire, refresh it
    if (!org.googleRefreshToken) {
      throw new Error('No refresh token available. Please reconnect your Google account in Settings.');
    }

    const newAccessToken = await refreshGoogleToken(org.googleRefreshToken);

    // Update in Firestore
    await updateDoc(orgRef, {
      googleAccessToken: newAccessToken,
      googleTokenExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
      updatedAt: new Date(),
    });

    return newAccessToken;
  }

  return org.googleAccessToken;
};

/**
 * Map company name to category (matching Excel export)
 */
const categorizeCompany = (company: string): string => {
  if (!company) return '';

  const lower = company.toLowerCase();
  if (lower.includes('amazon')) return 'APARATOS ELÉCTRICOS DEL HOGAR';
  if (lower.includes('shein')) return 'PRENDAS DE VESTIR Y ACCESORIOS PARA DAMA';
  if (lower.includes('temu')) return 'OTROS_ARTICULOS_IMPORTADOS';
  return '';
};

/**
 * Build sheet rows from orders (ONE ROW PER ITEM + SUBTOTAL ROW PER ORDER)
 * Customer name and package number only shown on first row of each order
 */
const buildLineItemSheetRows = (orders: OrderRow[]): any[][] => {
  const rows: any[][] = [];

  for (let orderIndex = 0; orderIndex < orders.length; orderIndex++) {
    const order = orders[orderIndex];

    if (!order.items || order.items.length === 0) {
      // No items - create single row with order-level data
      const orderValue = order.value || 0;
      const orderQuantity = order.pieces || 0;

      rows.push([
        order.consignee || '',                    // A: Consignatario
        order.packageNumber || '',                // B: No de PK
        orderQuantity,                            // C: Cant.
        categorizeCompany(order.company || ''),   // D: Categoria
        'No item details',                        // E: Descripcion
        '',                                       // F: Usado (empty)
        'X',                                      // G: Nuevo (X)
        orderValue,                               // H: Valor Unit
        orderValue,                               // I: Total
        ''                                        // J: IVA (blank)
      ]);

      // Add per-customer total row (no "SUBTOTAL" text - just bold quantity and total)
      rows.push([
        '',                                       // A: Consignatario (blank)
        '',                                       // B: No de PK (blank)
        orderQuantity,                            // C: Total quantity (will be bolded)
        '',                                       // D: Categoria (blank)
        '',                                       // E: Description (blank - no redundant SUBTOTAL text)
        '',                                       // F: Usado (blank)
        '',                                       // G: Nuevo (blank)
        '',                                       // H: Valor Unit (blank)
        orderValue,                               // I: Total value
        ''                                        // J: IVA (blank)
      ]);
    } else {
      // Has items - create one row per item
      let totalQuantity = 0;
      let totalValue = 0;

      for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
        const item = order.items[itemIndex];
        const description = item.name + (item.description ? ' - ' + item.description : '');

        // Only show customer name and package number on FIRST row
        const isFirstRow = itemIndex === 0;

        rows.push([
          isFirstRow ? (order.consignee || '').toUpperCase() : '',  // A: Consignatario (only first row, uppercase)
          isFirstRow ? (order.packageNumber || '') : '',            // B: No de PK (only first row)
          item.quantity || 0,                                       // C: Cant.
          categorizeCompany(order.company || ''),                   // D: Categoria
          description.toUpperCase(),                                // E: Descripcion (uppercase)
          '',                                                       // F: Usado (empty)
          'X',                                                      // G: Nuevo (X)
          item.unitValue || 0,                                      // H: Valor Unit
          item.totalValue || 0,                                     // I: Total
          ''                                                        // J: IVA (blank for manual entry)
        ]);

        // Accumulate totals for subtotal row
        totalQuantity += item.quantity || 0;
        totalValue += item.totalValue || 0;
      }

      // Validate: Compare calculated total with order.value
      const orderValue = order.value || 0;
      const difference = Math.abs(totalValue - orderValue);

      // 🔴 IMPORTANT: Use order.value if it differs from items total
      // Order.value includes discounts/taxes - this is what was actually paid
      let finalTotalValue = totalValue; // Default to items sum

      if (difference > 0.01) {
        // If order has a different total, it likely includes discounts or taxes
        // Use the order.value as it represents the actual amount paid
        finalTotalValue = orderValue;

        console.warn(
          `✓ Discount/Tax adjustment for ${order.packageNumber}:`,
          `\n  Items subtotal: $${totalValue.toFixed(2)}`,
          `\n  Order total (after discounts/taxes): $${orderValue.toFixed(2)}`,
          `\n  Difference: $${difference.toFixed(2)}`,
          `\n  Using order total ($${orderValue.toFixed(2)}) - this is what customer actually paid.`
        );
      }

      // Add per-customer total row (no "SUBTOTAL" text - just bold quantity and total)
      rows.push([
        '',                                       // A: Consignatario (blank)
        '',                                       // B: No de PK (blank)
        totalQuantity,                            // C: Total quantity (will be bolded)
        '',                                       // D: Categoria (blank)
        '',                                       // E: Description (blank - no redundant SUBTOTAL text)
        '',                                       // F: Usado (blank)
        '',                                       // G: Nuevo (blank)
        '',                                       // H: Valor Unit (blank)
        finalTotalValue,                          // I: Total value (order total with discounts/taxes)
        ''                                        // J: IVA (blank)
      ]);
    }

    // Add ONE blank row between customers within the same export (but NOT after the last customer)
    const isLastCustomer = orderIndex === orders.length - 1;
    if (!isLastCustomer) {
      rows.push(['', '', '', '', '', '', '', '', '', '']);
    }
  }

  // Add separator row to clearly mark end of export batch
  rows.push(['', '', '', '', '─────────────── END OF EXPORT ───────────────', '', '', '', '', '']);

  // Add blank rows for spacing before next export
  rows.push(['', '', '', '', '', '', '', '', '', '']);
  rows.push(['', '', '', '', '', '', '', '', '', '']);

  return rows;
};

/**
 * Get the last row number in a sheet (for appending data)
 */
const getSheetEndRow = async (sheetId: string, accessToken: string, sheetName: string = 'CONTROL'): Promise<number> => {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get sheet data');
    }

    const data = await response.json();
    // Template has headers in rows 1-7, data starts at row 8
    // Return the last row with data, or 7 if sheet only has headers
    return data.values ? data.values.length : 7;
  } catch (error) {
    console.error('Error getting sheet end row:', error);
    throw error;
  }
};

/**
 * NOT USED - User must manually duplicate template for exact 1:1 formatting
 * Automatic creation cannot match the exact customs template formatting
 */
const createNewSheet = async (
  accessToken: string,
  organizationName: string,
  folderId?: string
): Promise<string> => {
  throw new Error('Customs sheet must be set up manually for exact template formatting');
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sheetTitle = `Customs Export - ${today}`;

  console.log('Creating new customs sheet with template formatting...');

  // Create spreadsheet with basic structure
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: sheetTitle,
      },
      sheets: [
        {
          properties: {
            title: 'CONTROL',
            gridProperties: {
              frozenRowCount: 7, // Freeze header rows
              columnCount: 11,
              rowCount: 100,
            },
          },
        },
      ],
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Failed to create spreadsheet:', error);
    throw new Error('Failed to create customs sheet');
  }

  const sheet = await createResponse.json();
  const sheetId = sheet.spreadsheetId;

  console.log(`✓ Created sheet: ${sheetId}`);

  // Now format it to match the customs template
  await formatCustomsSheet(sheetId, accessToken);

  // Move to folder if provided
  if (folderId) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}?addParents=${folderId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      console.log(`✓ Moved to folder`);
    } catch (error) {
      console.warn('Failed to move sheet to folder:', error);
    }
  }

  return sheetId;
};

/**
 * Format the sheet to match the customs template exactly
 */
const formatCustomsSheet = async (sheetId: string, accessToken: string): Promise<void> => {
  console.log('Applying customs template formatting...');

  const requests: any[] = [];

  // Set column widths
  const columnWidths = [60, 150, 100, 80, 120, 250, 80, 80, 120, 120, 100];
  columnWidths.forEach((width, index) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: 0,
          dimension: 'COLUMNS',
          startIndex: index,
          endIndex: index + 1,
        },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    });
  });

  // Add header data
  requests.push({
    updateCells: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 11 },
      rows: [
        // Row 1: Title
        {
          values: [
            { userEnteredValue: { stringValue: '' } },
            {
              userEnteredValue: { stringValue: 'DECLARACIÓN DE MERCANCÍAS PARA ENVÍOS DE BAJO VALOR Y DECLARACIÓN DE EQUIPAJE' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 12 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              },
            },
            ...Array(9).fill({ userEnteredValue: { stringValue: '' } }),
          ],
        },
        // Row 2: Registration number
        {
          values: [
            { userEnteredValue: { stringValue: '' } },
            { userEnteredValue: { stringValue: 'No. de registro de mercancías:' } },
            ...Array(9).fill({ userEnteredValue: { stringValue: '' } }),
          ],
        },
        // Row 3: Date
        {
          values: [
            { userEnteredValue: { stringValue: '' } },
            { userEnteredValue: { stringValue: 'Fecha de registro:' } },
            ...Array(9).fill({ userEnteredValue: { stringValue: '' } }),
          ],
        },
        // Row 4: Customs code
        {
          values: [
            { userEnteredValue: { stringValue: '' } },
            { userEnteredValue: { stringValue: 'Codigo de aduana: 3' } },
            ...Array(9).fill({ userEnteredValue: { stringValue: '' } }),
          ],
        },
        // Row 5: Blank
        { values: Array(11).fill({ userEnteredValue: { stringValue: '' } }) },
        // Row 6: Empty row before headers
        { values: Array(11).fill({ userEnteredValue: { stringValue: '' } }) },
        // Row 7: Main headers
        {
          values: [
            { userEnteredValue: { stringValue: '' } },
            {
              userEnteredValue: { stringValue: 'Consignatario Persona Natural' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'No de PK' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'Cant.' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'Categoria' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'Descripcion' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'Mercancias' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            { userEnteredValue: { stringValue: '' } }, // Column 7 (part of Mercancias merge)
            {
              userEnteredValue: { stringValue: 'Valor Unit. $' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'Total' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'IVA o 30%' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
          ],
        },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  });

  // Row 8: Sub-headers (Usado/Nuevo)
  requests.push({
    updateCells: {
      range: { sheetId: 0, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 5, endColumnIndex: 7 },
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: 'Usado' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 9 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
            {
              userEnteredValue: { stringValue: 'Nuevo' },
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 9 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                borders: {
                  top: { style: 'SOLID' },
                  bottom: { style: 'SOLID' },
                  left: { style: 'SOLID' },
                  right: { style: 'SOLID' },
                },
              },
            },
          ],
        },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  });

  // Merge cells for headers
  // B1:J1 (title row)
  requests.push({ mergeCells: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } });

  // Merge F7:G7 (Mercancias spans both columns)
  requests.push({ mergeCells: { range: { sheetId: 0, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } });

  // Merge other header cells vertically (rows 7-8) except Mercancias columns
  const columnsToMerge = [1, 2, 3, 4, 7, 8, 9]; // B, C, D, E, H, I, J (skip F-G which are Mercancias)
  columnsToMerge.forEach(col => {
    requests.push({
      mergeCells: {
        range: { sheetId: 0, startRowIndex: 6, endRowIndex: 8, startColumnIndex: col, endColumnIndex: col + 1 },
        mergeType: 'MERGE_ALL',
      },
    });
  });

  // Apply all formatting
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  console.log('✓ Applied customs template formatting');
};

/**
 * Append rows to existing sheet (data starts at row 8 in template)
 */
const appendToSheet = async (
  sheetId: string,
  rows: any[][],
  accessToken: string,
  sheetName: string = 'CONTROL'
): Promise<void> => {
  // First, get the current end row to know where to append
  const endRow = await getSheetEndRow(sheetId, accessToken, sheetName);
  const startRow = Math.max(endRow + 1, 8); // Start at row 8 minimum (after headers)

  console.log(`Appending ${rows.length} rows starting at row ${startRow} in sheet "${sheetName}"`);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A${startRow}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to append to sheet:', error);
    throw new Error('Failed to append data to Google Sheet');
  }
};

/**
 * Main export function
 */
export const exportOrdersToGoogleSheets = async (
  orders: OrderRow[],
  organizationId: string,
  exportedBy?: string
): Promise<{ success: boolean; sheetUrl?: string; error?: string; isNew?: boolean }> => {
  try {
    if (!orders || orders.length === 0) {
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

    console.log(`Starting Google Sheets export for ${sortedOrders.length} order(s) (sorted alphabetically by full name)...`);

    // Get valid access token
    const accessToken = await getValidAccessToken(organizationId);

    // Get organization data
    const orgRef = doc(db, 'organizations', organizationId);
    const orgSnap = await getDoc(orgRef);
    const org = orgSnap.data() as Organization;

    // Get or create folder
    const folderId = org.googleDriveFolderId;

    // Build line-item rows
    const rows = buildLineItemSheetRows(sortedOrders);
    console.log(`Built ${rows.length} line-item rows from ${sortedOrders.length} order(s)`);

    let sheetId: string;
    let isNew = false;

    // Check for active sheet
    const activeSheetId = (org as any).activeGoogleSheetId;

    if (activeSheetId) {
      // Try to append to existing sheet
      try {
        console.log('Appending to existing customs sheet:', activeSheetId);
        await appendToSheet(activeSheetId, rows, accessToken, 'CONTROL');
        sheetId = activeSheetId;
      } catch (error) {
        console.warn('Failed to append to existing sheet, creating new one:', error);
        // Create new sheet if append fails
        sheetId = await createNewSheet(accessToken, org.organizationName, folderId);
        await appendToSheet(sheetId, rows, accessToken, 'CONTROL');
        isNew = true;

        // Update active sheet ID
        await updateDoc(orgRef, {
          activeGoogleSheetId: sheetId,
          updatedAt: new Date(),
        });
      }
    } else {
      // Create new customs sheet automatically (just like Docs!)
      console.log('Creating new customs sheet...');
      sheetId = await createNewSheet(accessToken, org.organizationName, folderId);
      await appendToSheet(sheetId, rows, accessToken, 'CONTROL');
      isNew = true;

      // Save active sheet ID
      await updateDoc(orgRef, {
        activeGoogleSheetId: sheetId,
        updatedAt: new Date(),
      });
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;

    // Track export history
    try {
      await addDoc(collection(db, 'exportHistory'), {
        sheetId,
        sheetUrl,
        exportType: 'google-sheets-lineitems',
        organizationId,
        organizationName: org.organizationName,
        orderCount: sortedOrders.length,
        lineItemCount: rows.length,
        customerNames: [...new Set(sortedOrders.map(o => o.consignee).filter(Boolean))],
        packageNumbers: sortedOrders.map(o => o.packageNumber).filter(Boolean),
        totalValue: sortedOrders.reduce((sum, o) => sum + (o.value || 0), 0),
        exportedBy: exportedBy || 'unknown',
        exportedAt: new Date(),
        isNewSheet: isNew,
      });
    } catch (error) {
      console.warn('Failed to track export history:', error);
      // Non-critical, continue
    }

    console.log('✓ Export successful!');
    return { success: true, sheetUrl, isNew };
  } catch (error) {
    console.error('Export failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Clear active customs sheet ID (user will need to set up a new one manually)
 */
export const startNewGoogleSheet = async (organizationId: string): Promise<void> => {
  const orgRef = doc(db, 'organizations', organizationId);
  await updateDoc(orgRef, {
    activeGoogleSheetId: null,
    updatedAt: new Date(),
  });
};
