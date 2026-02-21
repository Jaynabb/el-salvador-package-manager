import ExcelJS from 'exceljs';
import type { OrderRow } from '../components/OrderManagement';

/**
 * Order Excel Export Service
 * Exports orders to Excel using the exact customs template format (1:1 copy)
 * Template: PLANTILLA DESARROLLO ABRIL 7 (1).xlsx
 * Preserves ALL formatting: colors, fonts, borders, merged cells, column widths, etc.
 */

/**
 * Map company name to category
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
 * Build Excel rows from orders - Data rows + per-customer subtotals (no ending SUBTOTAL/signature)
 * Template has grand SUBTOTAL fixed at row 65, signature at rows 68-69
 * Each customer gets their own subtotal row showing total quantity and order total
 * Returns: { dataRows, grandTotal }
 */
const buildExcelRows = (orders: OrderRow[]): { dataRows: any[][], grandTotal: number } => {
  const rows: any[][] = [];
  let grandTotalValue = 0;

  // Add all customer data with per-customer subtotals (no ending grand SUBTOTAL/signature yet)
  for (let orderIndex = 0; orderIndex < orders.length; orderIndex++) {
    const order = orders[orderIndex];

    if (!order.items || order.items.length === 0) {
      // No items - create single row with order-level data
      const orderValue = order.value || 0;
      const orderQuantity = order.pieces || 0;
      grandTotalValue += orderValue;

      console.log(`Building row for ${order.packageNumber} (no items) - Row ${rows.length + 1}`);
      rows.push([
        '', // Column A (empty)
        order.consignee || '',                    // B: Consignatario
        order.packageNumber || '',                // C: No de PK
        orderQuantity,                            // D: Cant.
        'No item details',                        // E: Descripcion
        '',                                       // F: Usado (empty)
        'X',                                      // G: Nuevo (X)
        orderValue,                               // H: Valor Unit
        orderValue,                               // I: Total
        '',                                       // J: IVA (blank)
      ]);

      // Add per-customer total row (no "SUBTOTAL" text - just bold quantity and total)
      rows.push([
        '',                                       // Column A (empty)
        '',                                       // B: Consignatario (blank)
        '',                                       // C: No de PK (blank)
        orderQuantity,                            // D: Total quantity (will be bolded)
        '',                                       // E: Description (blank - no redundant SUBTOTAL text)
        '',                                       // F: Usado (blank)
        '',                                       // G: Nuevo (blank)
        '',                                       // H: Valor Unit (blank)
        orderValue,                               // I: Total value
        '',                                       // J: IVA (blank)
      ]);
    } else {
      // Has items - create one row per item
      console.log(`Building rows for ${order.packageNumber} - ${order.items.length} items`);

      // Calculate totals ONCE for this order
      const itemsTotal = order.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
      const orderTotal = order.value || 0;
      const difference = Math.abs(itemsTotal - orderTotal);

      // Track totals for this customer's subtotal row
      let totalQuantity = 0;
      let finalTotalValue = itemsTotal; // Default to items sum

      // 🔴 IMPORTANT: Use order.value if it differs (includes discounts/taxes)
      if (difference > 0.01) {
        console.log(
          `✓ Discount/Tax adjustment for ${order.packageNumber}:`,
          `Items: $${itemsTotal.toFixed(2)}, Order: $${orderTotal.toFixed(2)}, Using: $${orderTotal.toFixed(2)}`
        );
        finalTotalValue = orderTotal; // Use order total with discounts
        grandTotalValue += orderTotal;
      } else {
        grandTotalValue += itemsTotal; // Use items total
      }

      for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
        const item = order.items[itemIndex];
        const description = item.name + (item.description ? ' - ' + item.description : '');

        // Only show customer name and package number on FIRST row
        const isFirstRow = itemIndex === 0;

        rows.push([
          '',                                                      // Column A (empty)
          isFirstRow ? (order.consignee || '').toUpperCase() : '', // B: Consignatario (only first row, uppercase)
          isFirstRow ? (order.packageNumber || '') : '',           // C: No de PK (only first row)
          item.quantity || 0,                                      // D: Cant.
          description.toUpperCase(),                               // E: Descripcion (uppercase like template)
          '',                                                      // F: Usado (empty)
          'X',                                                     // G: Nuevo (X)
          item.unitValue || 0,                                     // H: Valor Unit
          item.totalValue || 0,                                    // I: Total
          '',                                                      // J: IVA (blank for manual entry)
        ]);

        // Accumulate totals for subtotal row
        totalQuantity += item.quantity || 0;
      }

      // Add per-customer total row (no "SUBTOTAL" text - just bold quantity and total)
      rows.push([
        '',                                       // Column A (empty)
        '',                                       // B: Consignatario (blank)
        '',                                       // C: No de PK (blank)
        totalQuantity,                            // D: Total quantity (will be bolded)
        '',                                       // E: Description (blank - no redundant SUBTOTAL text)
        '',                                       // F: Usado (blank)
        '',                                       // G: Nuevo (blank)
        '',                                       // H: Valor Unit (blank)
        finalTotalValue,                          // I: Total value (order total with discounts/taxes)
        '',                                       // J: IVA (blank)
      ]);
    }

    // Add blank row between customers
    const isLastCustomer = orderIndex === orders.length - 1;
    if (!isLastCustomer) {
      rows.push(['', '', '', '', '', '', '', '', '', '']); // 10 columns (A-J)
    }
  }

  return { dataRows: rows, grandTotal: grandTotalValue };
};

/**
 * Main export function - generates Excel file using template (preserves ALL formatting)
 * Uses ExcelJS for TRUE 1:1 copy with all styles, colors, fonts, borders, merged cells preserved
 */
export const exportOrdersToExcel = async (
  orders: OrderRow[]
): Promise<{ success: boolean; error?: string }> => {
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

    console.log(`Starting Excel export for ${sortedOrders.length} order(s)...`);
    console.log('Package numbers being exported (sorted alphabetically):', sortedOrders.map(o => `${o.consignee} (${o.packageNumber})`).join(', '));

    // Fetch the CLEAN template file (only has rows 1-70, no extra sections)
    const response = await fetch('/PLANTILLA_CLEAN.xlsx');
    if (!response.ok) {
      throw new Error('Failed to load Excel template');
    }

    const arrayBuffer = await response.arrayBuffer();

    // Load template workbook with ExcelJS (preserves ALL formatting)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // Get the CONTROL sheet
    const worksheet = workbook.getWorksheet('CONTROL');
    if (!worksheet) {
      throw new Error('CONTROL sheet not found in template');
    }

    // IMPORTANT: ExcelJS loses merged cells and view settings when we modify cells
    // We need to preserve them and reapply AFTER all modifications
    const savedMerges = worksheet.model.merges ? [...worksheet.model.merges] : [];
    const savedViews = worksheet.views ? [...worksheet.views] : [];
    console.log(`Template has ${savedMerges.length} merged cells - will restore after modifications`);
    console.log(`Template views (gridlines hidden): ${savedViews.length > 0 ? savedViews[0].showGridLines === false : 'none'}`);

    // Build our data rows (without SUBTOTAL/signature - those stay in template)
    const { dataRows, grandTotal} = buildExcelRows(sortedOrders);
    console.log(`Built ${dataRows.length} data rows from ${sortedOrders.length} order(s), grand total: $${grandTotal}`);

    // STEP 1: Save the formatting AND row height from template rows - BEFORE we clear anything
    const templateRow = worksheet.getRow(9);
    const templateRowHeight = templateRow.height || 15; // Default to 15 if not set
    const templateStyles: any[] = [];
    for (let col = 1; col <= 10; col++) { // A-J (10 columns, no Categoria)
      const cell = templateRow.getCell(col);
      templateStyles[col] = {
        style: { ...cell.style },
        border: cell.border ? { ...cell.border } : undefined,
        fill: cell.fill ? { ...cell.fill } : undefined,
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        numFmt: cell.numFmt,
      };
    }
    console.log(`Saved template row formatting and height (${templateRowHeight}) for dynamic row creation`);

    // CRITICAL: Save SUBTOTAL row (65) formatting BEFORE clearing
    const originalSubtotalRow = worksheet.getRow(65);
    const savedSubtotalHeight = originalSubtotalRow.height || templateRowHeight;
    const savedSubtotalStyles: any[] = [];
    for (let col = 1; col <= 10; col++) {
      const cell = originalSubtotalRow.getCell(col);
      savedSubtotalStyles[col] = {
        style: cell.style ? { ...cell.style } : undefined,
        border: cell.border ? { ...cell.border } : undefined,
        fill: cell.fill ? { ...cell.fill } : undefined,
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        numFmt: cell.numFmt,
        value: cell.value, // Save the value too (like "SUBTOTAL" label)
      };
    }

    // CRITICAL: Save signature rows (68-69) formatting BEFORE clearing
    const originalSigLineRow = worksheet.getRow(68);
    const savedSigLineHeight = originalSigLineRow.height || templateRowHeight;
    const savedSigLineStyles: any[] = [];
    for (let col = 1; col <= 10; col++) {
      const cell = originalSigLineRow.getCell(col);
      savedSigLineStyles[col] = {
        style: cell.style ? { ...cell.style } : undefined,
        border: cell.border ? { ...cell.border } : undefined,
        fill: cell.fill ? { ...cell.fill } : undefined,
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        numFmt: cell.numFmt,
        value: cell.value, // Save signature lines
      };
    }

    const originalSigLabelRow = worksheet.getRow(69);
    const savedSigLabelHeight = originalSigLabelRow.height || templateRowHeight;
    const savedSigLabelStyles: any[] = [];
    for (let col = 1; col <= 10; col++) {
      const cell = originalSigLabelRow.getCell(col);
      savedSigLabelStyles[col] = {
        style: cell.style ? { ...cell.style } : undefined,
        border: cell.border ? { ...cell.border } : undefined,
        fill: cell.fill ? { ...cell.fill } : undefined,
        font: cell.font ? { ...cell.font } : undefined,
        alignment: cell.alignment ? { ...cell.alignment } : undefined,
        numFmt: cell.numFmt,
        value: cell.value, // Save "Nombre" and "Firma" labels
      };
    }

    // Also save blank rows 66-67 (between SUBTOTAL and signature)
    const originalBlankRow66 = worksheet.getRow(66);
    const savedBlankRow66Height = originalBlankRow66.height || templateRowHeight;

    const originalBlankRow67 = worksheet.getRow(67);
    const savedBlankRow67Height = originalBlankRow67.height || templateRowHeight;

    console.log('Saved SUBTOTAL and signature formatting before clearing');

    // STEP 2: Clear ALL existing data from row 9 to row 70 (entire template area including old SUBTOTAL/signature)
    // This must happen BEFORE writing new data to avoid accidentally clearing our new data
    console.log('Clearing template rows 9-70 before writing new data');
    for (let rowNum = 9; rowNum <= 70; rowNum++) {
      const row = worksheet.getRow(rowNum);
      for (let col = 1; col <= 10; col++) {
        const cell = row.getCell(col);
        cell.value = null;
        cell.dataValidation = null;
      }
    }

    // STEP 3: Write our data starting at row 9, creating new formatted rows as needed
    const dataStartRow = 9;
    let currentRowNumber = dataStartRow;

    for (const rowData of dataRows) {
      const row = worksheet.getRow(currentRowNumber);

      // Set row height to match template
      row.height = templateRowHeight;

      // Detect per-customer total row (quantity in D, empty B/C/E, total in I)
      const isPerCustomerTotal =
        !rowData[1] && // B: Consignatario empty
        !rowData[2] && // C: No de PK empty
        rowData[3] &&  // D: Quantity has value
        !rowData[4] && // E: Description empty (no "SUBTOTAL" text)
        rowData[8];     // I: Total has value

      // Apply template formatting to ALL data rows (not just beyond row 64)
      // This is needed because we cleared the formatting when we cleared the data
      for (let col = 1; col <= 10; col++) {
        const cell = row.getCell(col);
        const template = templateStyles[col];
        if (template) {
          if (template.style) cell.style = { ...template.style };
          if (template.border) cell.border = { ...template.border };
          if (template.fill) cell.fill = { ...template.fill };
          if (template.font) cell.font = { ...template.font };
          if (template.alignment) cell.alignment = { ...template.alignment };
          if (template.numFmt) cell.numFmt = template.numFmt;
        }

        // Make quantity bold in per-customer total rows
        if (isPerCustomerTotal && col === 4) { // Column D (quantity)
          cell.font = { ...cell.font, bold: true };
        }
      }

      // Set values for each column (B through K, which is columns 2-11)
      rowData.forEach((value, index) => {
        if (index > 0 && value !== undefined && value !== '') {
          const cell = row.getCell(index + 1);
          cell.value = value;
          cell.dataValidation = null;
        }
      });

      currentRowNumber++;
    }

    const lastDataRow = currentRowNumber - 1;
    console.log(`Wrote ${dataRows.length} rows (row ${dataStartRow} to ${lastDataRow})`);

    // Add a blank row with formatting after last data (matches template row 64)
    const blankRowNum = lastDataRow + 1;
    const blankRow = worksheet.getRow(blankRowNum);
    blankRow.height = templateRowHeight; // Same height as data rows
    for (let col = 1; col <= 10; col++) {
      const cell = blankRow.getCell(col);
      const template = templateStyles[col];
      if (template) {
        if (template.style) cell.style = { ...template.style };
        if (template.border) cell.border = { ...template.border };
        if (template.fill) cell.fill = { ...template.fill };
        if (template.font) cell.font = { ...template.font };
        if (template.alignment) cell.alignment = { ...template.alignment };
      }
      cell.value = null;
    }

    // STEP 4: Place SUBTOTAL row at correct position (1 row after blank row)
    const subtotalRowNum = blankRowNum + 1;
    console.log(`Placing SUBTOTAL at row ${subtotalRowNum}`);

    // Apply saved SUBTOTAL formatting to new position
    const subtotalRow = worksheet.getRow(subtotalRowNum);
    subtotalRow.height = savedSubtotalHeight;

    // Apply all saved cell styles and values
    for (let col = 1; col <= 10; col++) {
      const savedStyle = savedSubtotalStyles[col];
      const targetCell = subtotalRow.getCell(col);

      // Apply saved style
      if (savedStyle) {
        if (savedStyle.style) targetCell.style = { ...savedStyle.style };
        if (savedStyle.border) targetCell.border = { ...savedStyle.border };
        if (savedStyle.fill) targetCell.fill = { ...savedStyle.fill };
        if (savedStyle.font) targetCell.font = { ...savedStyle.font };
        if (savedStyle.alignment) targetCell.alignment = { ...savedStyle.alignment };
        if (savedStyle.numFmt) targetCell.numFmt = savedStyle.numFmt;

        // Copy value (except for column I which gets our grand total)
        if (col === 9) {
          targetCell.value = grandTotal; // Column I - our calculated total (was J before removing Categoria)
        } else if (savedStyle.value) {
          targetCell.value = savedStyle.value;
        }
      }
    }

    // Note: Template rows 65-70 were already cleared in STEP 2 (before writing data)
    // This prevents accidentally deleting data rows that extend into rows 65-70

    // Add 2 blank rows after SUBTOTAL (matches template rows 66-67)
    const blankAfterSubtotal1 = worksheet.getRow(subtotalRowNum + 1);
    blankAfterSubtotal1.height = savedBlankRow66Height;
    for (let col = 1; col <= 10; col++) {
      blankAfterSubtotal1.getCell(col).value = null;
    }

    const blankAfterSubtotal2 = worksheet.getRow(subtotalRowNum + 2);
    blankAfterSubtotal2.height = savedBlankRow67Height;
    for (let col = 1; col <= 10; col++) {
      blankAfterSubtotal2.getCell(col).value = null;
    }

    // STEP 5: Place signature area at FIXED POSITION at bottom of page (page footer)
    // Keep signature at original template position (rows 68-69) so it stays at bottom of page
    const signatureLineRowNum = 68; // Row with signature lines (FIXED - page footer)
    const signatureLabelRowNum = 69; // Row with "Nombre" and "Firma" labels (FIXED - page footer)
    console.log(`📝 Signature placement: FIXED at bottom of page (rows ${signatureLineRowNum}-${signatureLabelRowNum}) - not moving with data`);

    // Apply saved signature line row formatting
    const newSigLineRow = worksheet.getRow(signatureLineRowNum);
    newSigLineRow.height = savedSigLineHeight;

    for (let col = 1; col <= 10; col++) {
      const savedStyle = savedSigLineStyles[col];
      const targetCell = newSigLineRow.getCell(col);

      if (savedStyle) {
        if (savedStyle.style) targetCell.style = { ...savedStyle.style };
        if (savedStyle.border) targetCell.border = { ...savedStyle.border };
        if (savedStyle.fill) targetCell.fill = { ...savedStyle.fill };
        if (savedStyle.font) targetCell.font = { ...savedStyle.font };
        if (savedStyle.alignment) targetCell.alignment = { ...savedStyle.alignment };
        if (savedStyle.numFmt) targetCell.numFmt = savedStyle.numFmt;
        if (savedStyle.value) targetCell.value = savedStyle.value;
      }
    }

    // Apply saved signature label row formatting
    const newSigLabelRow = worksheet.getRow(signatureLabelRowNum);
    newSigLabelRow.height = savedSigLabelHeight;

    for (let col = 1; col <= 10; col++) {
      const savedStyle = savedSigLabelStyles[col];
      const targetCell = newSigLabelRow.getCell(col);

      if (savedStyle) {
        if (savedStyle.style) targetCell.style = { ...savedStyle.style };
        if (savedStyle.border) targetCell.border = { ...savedStyle.border };
        if (savedStyle.fill) targetCell.fill = { ...savedStyle.fill };
        if (savedStyle.font) targetCell.font = { ...savedStyle.font };
        if (savedStyle.alignment) targetCell.alignment = { ...savedStyle.alignment };
        if (savedStyle.numFmt) targetCell.numFmt = savedStyle.numFmt;
        if (savedStyle.value) targetCell.value = savedStyle.value;
      }
    }

    // Note: Original signature rows (68-69) were already cleared above with rows 65-70

    // CRITICAL: Re-apply merged cells from template, adjusting row numbers for SUBTOTAL/signature
    console.log(`Restoring ${savedMerges.length} merged cells from template...`);
    console.log('Saved merges:', savedMerges);

    const adjustedMerges: string[] = [];
    const rowOffset = subtotalRowNum - 65; // How many rows we shifted SUBTOTAL

    for (const mergeRange of savedMerges) {
      try {
        // Parse the merge range (e.g., "B7:B8" -> from B7 to B8)
        const [start, end] = mergeRange.split(':');

        // Extract row numbers from the merge range
        const startRow = parseInt(start.match(/\d+/)?.[0] || '0');
        const endRow = parseInt(end.match(/\d+/)?.[0] || '0');

        let adjustedRange = mergeRange;

        // If this merge is in SUBTOTAL row (65), shift it
        if (startRow === 65 && endRow === 65) {
          const newRow = subtotalRowNum;
          adjustedRange = mergeRange.replace(/65/g, newRow.toString());
          console.log(`  Adjusting SUBTOTAL merge: ${mergeRange} → ${adjustedRange}`);
        }
        // Signature area (68-69) stays FIXED at bottom of page - don't adjust
        else if (startRow >= 68 && endRow <= 69) {
          adjustedRange = mergeRange; // Keep original position (page footer)
          console.log(`  Keeping signature merge at original position (page footer): ${mergeRange}`);
        }
        // Header merges (rows 1-8) and data area - keep as-is
        else {
          adjustedRange = mergeRange;
        }

        adjustedMerges.push(adjustedRange);

        // Apply the merge
        const startCell = worksheet.getCell(adjustedRange.split(':')[0]);
        if (!startCell.isMerged) {
          worksheet.mergeCells(adjustedRange);
          console.log(`  ✓ Applied merge: ${adjustedRange}`);
        } else {
          console.log(`  - Already merged: ${adjustedRange}`);
        }
      } catch (error) {
        console.warn(`  ✗ Failed to merge ${mergeRange}:`, error);
      }
    }

    worksheet.model.merges = adjustedMerges;
    console.log(`Final merge count: ${adjustedMerges.length} (expected: ${savedMerges.length})`);

    // CRITICAL: Restore view settings (including showGridLines: false)
    if (savedViews && savedViews.length > 0) {
      worksheet.views = savedViews;
      console.log('✓ Restored view settings (gridlines hidden)');
    }

    // Generate filename with timestamp
    const timestamp = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '-');

    const filename = `Customs_Export_${timestamp}_${sortedOrders.length}orders.xlsx`;

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Create blob and trigger download
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    console.log('✓ Export successful! File downloaded with ALL formatting preserved.');
    return { success: true };
  } catch (error) {
    console.error('Export failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
