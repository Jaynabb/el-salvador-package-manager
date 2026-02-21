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

    // STEP 3: Write data with automatic 68-row pagination
    // Each "page" is 68 rows: First page has header (rows 1-8) + data (rows 9-67) + signature (row 68)
    // Subsequent pages: data + signature at row 136, 204, 272, etc.
    const dataStartRow = 9;
    const ROWS_PER_PAGE = 68;
    const FIRST_PAGE_DATA_ROWS = 59; // Rows 9-67 (row 68 is signature)
    const SUBSEQUENT_PAGE_DATA_ROWS = 67; // 68 rows minus 1 for signature

    let currentRowNumber = dataStartRow;
    let dataRowsWritten = 0;
    let isFirstPage = true;

    // Helper function to add signature row
    const addSignatureRow = (rowNum: number) => {
      console.log(`📝 Adding signature at row ${rowNum}`);
      const sigRow = worksheet.getRow(rowNum);
      sigRow.height = savedSigLabelHeight;

      for (let col = 1; col <= 10; col++) {
        const cell = sigRow.getCell(col);
        const savedStyle = savedSigLabelStyles[col];
        if (savedStyle) {
          if (savedStyle.style) cell.style = { ...savedStyle.style };
          if (savedStyle.border) cell.border = { ...savedStyle.border };
          if (savedStyle.fill) cell.fill = { ...savedStyle.fill };
          if (savedStyle.font) cell.font = { ...savedStyle.font };
          if (savedStyle.alignment) cell.alignment = { ...savedStyle.alignment };
          if (savedStyle.numFmt) cell.numFmt = savedStyle.numFmt;
          if (savedStyle.value) cell.value = savedStyle.value;
        }
      }
    };

    for (let i = 0; i < dataRows.length; i++) {
      const rowData = dataRows[i];

      // Check if we need to add signature before this row
      const dataRowsThisPage = isFirstPage ? FIRST_PAGE_DATA_ROWS : SUBSEQUENT_PAGE_DATA_ROWS;

      if (dataRowsWritten > 0 && dataRowsWritten % dataRowsThisPage === 0) {
        // Add signature at current row
        addSignatureRow(currentRowNumber);
        currentRowNumber++;
        isFirstPage = false; // After first signature, we're on subsequent pages
      }

      // Write data row
      const row = worksheet.getRow(currentRowNumber);
      row.height = templateRowHeight;

      // Detect per-customer total row
      const isPerCustomerTotal =
        !rowData[1] && !rowData[2] && rowData[3] && !rowData[4] && rowData[8];

      // Apply template formatting
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

        if (isPerCustomerTotal && col === 4) {
          cell.font = { ...cell.font, bold: true };
        }
      }

      // Set values
      rowData.forEach((value, index) => {
        if (index > 0 && value !== undefined && value !== '') {
          const cell = row.getCell(index + 1);
          cell.value = value;
          cell.dataValidation = null;
        }
      });

      currentRowNumber++;
      dataRowsWritten++;
    }

    console.log(`Wrote ${dataRows.length} data rows with automatic pagination`);

    // Add final signature at row 68, or next multiple of 68
    const nextSignatureRow = Math.ceil(currentRowNumber / ROWS_PER_PAGE) * ROWS_PER_PAGE;
    addSignatureRow(nextSignatureRow);
    console.log(`📝 Added final signature at row ${nextSignatureRow}`);

    // CRITICAL: Re-apply merged cells from template for header area only
    // Signature rows are now dynamically placed, so we don't merge those from template
    console.log(`Restoring header merged cells from template...`);
    console.log('Saved merges:', savedMerges);

    const adjustedMerges: string[] = [];

    for (const mergeRange of savedMerges) {
      try {
        const [start, end] = mergeRange.split(':');
        const startRow = parseInt(start.match(/\d+/)?.[0] || '0');
        const endRow = parseInt(end.match(/\d+/)?.[0] || '0');

        let adjustedRange = mergeRange;

        // Only preserve header merges (rows 1-8)
        if (startRow <= 8 && endRow <= 8) {
          adjustedRange = mergeRange;
          adjustedMerges.push(adjustedRange);

          const startCell = worksheet.getCell(adjustedRange.split(':')[0]);
          if (!startCell.isMerged) {
            worksheet.mergeCells(adjustedRange);
            console.log(`  ✓ Applied header merge: ${adjustedRange}`);
          }
        } else {
          console.log(`  Skipping data/signature merge: ${mergeRange} (not needed with dynamic pagination)`);
        }
      } catch (error) {
        console.warn(`  ✗ Failed to merge ${mergeRange}:`, error);
      }
    }

    worksheet.model.merges = adjustedMerges;
    console.log(`Final merge count: ${adjustedMerges.length} (header only)`);

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
