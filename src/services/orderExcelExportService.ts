import ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import type { OrderRow } from '../components/OrderManagement';

/**
 * Desarrollo Excel Export Service
 * Builds the customs CONTROL sheet from scratch to match the Google Sheet reference format.
 * Columns C-K, Calibri 13pt, full grid borders, formulas for TOTAL/SUBTOTAL/Grand TOTAL,
 * pagination keeping whole customers together, page indicators, and signature blocks.
 */

// ── Style constants ──────────────────────────────────────────────────────────

const FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 13, color: { argb: 'FF000000' } };
const FONT_BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const CURRENCY_FORMAT = '"$"#,##0.00';

// Border matching reference: thin black (argb FF000000)
const TB: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };

// Full grid border for all data cells C-K
const CELL_BORDER: Partial<ExcelJS.Borders> = { left: TB, right: TB, top: TB, bottom: TB };

const ROW_HEIGHT = 15.75;
const MAX_DATA_ROWS_PER_PAGE = 60;

const COLUMN_WIDTHS: Record<string, number> = {
  A: 8.71, B: 2.14, C: 24.86, D: 14.43, E: 5, F: 54,
  G: 8.86, H: 15.14, I: 12.14, J: 21.71, K: 8.71,
};

// ── Data structures ──────────────────────────────────────────────────────────

interface CustomerBlock {
  consignee: string;
  packageNumber: string;
  items: { quantity: number; description: string; unitValue: number; totalValue: number }[];
  totalQuantity: number;
  totalValue: number;
}

// ── Helper: apply grid borders to columns C-K on a row ───────────────────────

const applyGridBorders = (ws: ExcelJS.Worksheet, rowNum: number) => {
  for (const col of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
    ws.getCell(`${col}${rowNum}`).border = { ...CELL_BORDER };
  }
};

// ── Helper: apply SUBTOTAL row borders (H/J special pattern) ─────────────────

const applySubtotalBorders = (ws: ExcelJS.Worksheet, rowNum: number) => {
  // Only H, I, J get borders — C-G and K are empty/borderless (per PDF reference)
  ws.getCell(`H${rowNum}`).border = { left: TB, top: TB, bottom: TB };
  ws.getCell(`I${rowNum}`).border = { ...CELL_BORDER };
  ws.getCell(`J${rowNum}`).border = { right: TB, top: TB, bottom: TB };
};

// ── Build customer blocks from orders ────────────────────────────────────────

const buildCustomerBlocks = (orders: OrderRow[]): CustomerBlock[] => {
  const sorted = [...orders].sort((a, b) => {
    const nameA = (a.consignee || '').toLowerCase().trim();
    const nameB = (b.consignee || '').toLowerCase().trim();
    return nameA.localeCompare(nameB);
  });

  return sorted.map(order => {
    if (!order.items || order.items.length === 0) {
      return {
        consignee: (order.consignee || '').toUpperCase(),
        packageNumber: order.packageNumber || '',
        items: [{
          quantity: order.pieces || 0,
          description: 'NO ITEM DETAILS',
          unitValue: order.value || 0,
          totalValue: order.value || 0,
        }],
        totalQuantity: order.pieces || 0,
        totalValue: order.value || 0,
      };
    }

    const items = order.items.map(item => ({
      quantity: item.quantity || 0,
      description: (item.name + (item.description ? ' - ' + item.description : '')).toUpperCase(),
      unitValue: item.unitValue || 0,
      totalValue: item.totalValue || 0,
    }));

    const itemsTotal = order.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const totalItemQuantity = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const totalQuantity = (order.pieces && order.pieces !== totalItemQuantity)
      ? order.pieces
      : totalItemQuantity;

    const totalValue = Math.abs(itemsTotal - (order.value || 0)) > 0.01
      ? (order.value || 0)
      : itemsTotal;

    return {
      consignee: (order.consignee || '').toUpperCase(),
      packageNumber: order.packageNumber || '',
      items,
      totalQuantity,
      totalValue,
    };
  });
};

// ── Pagination: group customers into pages, never splitting a customer ───────

const customerRowCount = (block: CustomerBlock): number =>
  block.items.length + 1 + 1; // items + TOTAL row + blank separator

const paginateCustomers = (blocks: CustomerBlock[]): CustomerBlock[][] => {
  const pages: CustomerBlock[][] = [];
  let currentPage: CustomerBlock[] = [];
  let currentPageRows = 0;

  for (const block of blocks) {
    const rows = customerRowCount(block);
    if (currentPageRows + rows > MAX_DATA_ROWS_PER_PAGE && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentPageRows = 0;
    }
    currentPage.push(block);
    currentPageRows += rows;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
};

// ── Title block (every page) ─────────────────────────────────────────────────

const writeTitleBlock = (
  ws: ExcelJS.Worksheet,
  startRow: number,
  pageNum: number,
  totalPages: number,
) => {
  // Cross-platform safe: no merges, no theme colors, no centerContinuous.
  // All text uses explicit argb black, plain alignment.

  // Row 1: "No. de registro de mercancías:" (left) + "Gestor 3145" (right)
  const r1 = startRow;
  ws.getCell(`C${r1}`).value = 'No. de registro de mercancías:';
  ws.getCell(`C${r1}`).font = { ...FONT };
  ws.getCell(`J${r1}`).value = 'Gestor 3145';
  ws.getCell(`J${r1}`).font = { ...FONT };
  ws.getRow(r1).height = ROW_HEIGHT;

  // Row 2: "Codigo de aduana: 3" (left) + "No. de hojas X de Y" (right)
  const r2 = startRow + 1;
  ws.getCell(`C${r2}`).value = 'Codigo de aduana: 3';
  ws.getCell(`C${r2}`).font = { ...FONT };
  ws.getCell(`J${r2}`).value = `No. de hojas ${pageNum} de ${totalPages}`;
  ws.getCell(`J${r2}`).font = { ...FONT };
  ws.getRow(r2).height = ROW_HEIGHT;

  // Row 3: blank
  ws.getRow(startRow + 2).height = ROW_HEIGHT;

  // Row 4: "DIRECCIÓN GENERAL DE ADUANAS" (bold, in F column — centered within the wide description column)
  const r4 = startRow + 3;
  ws.getCell(`F${r4}`).value = 'DIRECCIÓN GENERAL DE ADUANAS';
  ws.getCell(`F${r4}`).font = { ...FONT_BOLD };
  ws.getCell(`F${r4}`).alignment = { horizontal: 'center' };
  ws.getRow(r4).height = ROW_HEIGHT;

  // Row 5: "DIVISIÓN DE OPERACIONES" (bold, in F column)
  const r5 = startRow + 4;
  ws.getCell(`F${r5}`).value = 'DIVISIÓN DE OPERACIONES';
  ws.getCell(`F${r5}`).font = { ...FONT_BOLD };
  ws.getCell(`F${r5}`).alignment = { horizontal: 'center' };
  ws.getRow(r5).height = ROW_HEIGHT;

  // Row 6: blank (gap between DIVISIÓN and ANEXO, matching PDF)
  ws.getRow(startRow + 5).height = ROW_HEIGHT;

  // Row 7: ANEXO text (bold, in C column — long text overflows across empty cells)
  const r7 = startRow + 6;
  ws.getCell(`C${r7}`).value =
    'ANEXO A LA DECLARACIÓN DE MERCANCÍAS PARA PEQUEÑOS ENVÍOS Y DECLARACIÓN DE EQUIPAJE';
  ws.getCell(`C${r7}`).font = { ...FONT_BOLD };
  ws.getRow(r7).height = ROW_HEIGHT;
};

// ── Column headers (page 1 only) ────────────────────────────────────────────

const writeHeaders = (ws: ExcelJS.Worksheet, headerRow: number) => {
  const row7 = headerRow;
  const row8 = headerRow + 1;

  const setHeaderCell = (
    ref: string,
    value: string,
    extraAlign?: Partial<ExcelJS.Alignment>,
    borderOverride?: Partial<ExcelJS.Borders>,
  ) => {
    const cell = ws.getCell(ref);
    cell.value = value;
    cell.font = { ...FONT_BOLD };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      shrinkToFit: false,
      ...extraAlign,
    };
    cell.border = borderOverride ?? { left: TB, right: TB, top: TB };
  };

  setHeaderCell(`C${row7}`, 'Consignatario Persona Natural');
  setHeaderCell(`D${row7}`, 'No de PK');
  setHeaderCell(`E${row7}`, 'Cant.', { textRotation: 90 });
  setHeaderCell(`F${row7}`, 'Descripcion');
  setHeaderCell(`G${row7}`, 'Mercancias', {}, { left: TB, top: TB, bottom: TB });
  ws.getCell(`H${row7}`).border = { right: TB, top: TB, bottom: TB };
  setHeaderCell(`I${row7}`, 'Valor Unit. $');
  setHeaderCell(`J${row7}`, 'Total');
  setHeaderCell(`K${row7}`, 'IVA o 30%');

  // Row 8: sub-headers for G/H + bottom borders on all merged header cells
  for (const col of ['C', 'D', 'E', 'F', 'I', 'J', 'K']) {
    ws.getCell(`${col}${row8}`).border = { left: TB, right: TB, bottom: TB };
  }

  // G8: Usado
  const g8 = ws.getCell(`G${row8}`);
  g8.value = 'Usado';
  g8.font = { ...FONT };
  g8.alignment = { horizontal: 'center', wrapText: true, shrinkToFit: false };
  g8.border = { ...CELL_BORDER };

  // H8: Nuevo
  const h8 = ws.getCell(`H${row8}`);
  h8.value = 'Nuevo';
  h8.font = { ...FONT };
  h8.alignment = { horizontal: 'center', wrapText: true, shrinkToFit: false };
  h8.border = { ...CELL_BORDER };

  ws.getRow(row7).height = ROW_HEIGHT;
  ws.getRow(row8).height = ROW_HEIGHT;

  // Merges
  ws.mergeCells(`C${row7}:C${row8}`);
  ws.mergeCells(`D${row7}:D${row8}`);
  ws.mergeCells(`E${row7}:E${row8}`);
  ws.mergeCells(`F${row7}:F${row8}`);
  ws.mergeCells(`G${row7}:H${row7}`);
  ws.mergeCells(`I${row7}:I${row8}`);
  ws.mergeCells(`J${row7}:J${row8}`);
  ws.mergeCells(`K${row7}:K${row8}`);
};

// ── Fix ExcelJS dimension bug ────────────────────────────────────────────────
// ExcelJS miscalculates the worksheet dimension, outputting "D1:K…" instead of
// "C1:K…". Google Sheets uses this tag to determine the used range and silently
// drops any data outside it. This helper patches the raw xlsx zip to correct it.

const fixXlsxDimension = async (buffer: ExcelJS.Buffer): Promise<ArrayBuffer> => {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const xml = await zip.file(sheetPath)?.async('string');
  if (!xml) return buffer as ArrayBuffer;

  // Remove the dimension tag entirely.
  // ExcelJS miscalculates it (D1 instead of C1), and the tag also causes
  // Apple Numbers to draw an unwanted table outline around the used range.
  // Excel/Google Sheets recalculate the range from actual cell data on open.
  const fixed = xml.replace(/<dimension ref="[^"]*"\/>\s*/, '');

  if (fixed !== xml) {
    zip.file(sheetPath, fixed);
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  }
  return buffer as ArrayBuffer;
};

// ── Main export function ─────────────────────────────────────────────────────

export const exportOrdersToExcel = async (
  orders: OrderRow[],
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!orders || orders.length === 0) {
      return { success: false, error: 'No orders to export' };
    }

    const blocks = buildCustomerBlocks(orders);
    const pages = paginateCustomers(blocks);
    const totalPages = pages.length;

    console.log(
      `Desarrollo export: ${orders.length} orders → ${blocks.length} customers → ${totalPages} page(s)`,
    );

    // ── Create workbook from scratch ─────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('CONTROL');

    // Column widths
    for (const [letter, width] of Object.entries(COLUMN_WIDTHS)) {
      ws.getColumn(letter).width = width;
    }

    // Hide gridlines + page setup
    ws.views = [{ showGridLines: false }];
    ws.pageSetup = {
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      orientation: 'portrait',
      margins: {
        left: 0.25, right: 0.25,
        top: 0.93, bottom: 0.75,
        header: 0, footer: 0,
      },
      showGridLines: false,
      showRowColHeaders: false,
    };

    let currentRow = 1;
    const subtotalJRefs: string[] = [];

    // ── Write pages ──────────────────────────────────────────────────────
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const isFirstPage = pageIndex === 0;
      const isLastPage = pageIndex === pages.length - 1;

      // Title block on every page (7 rows)
      writeTitleBlock(ws, currentRow, pageIndex + 1, totalPages);
      currentRow += 7;

      // Blank row between title and content (all pages, matching PDF)
      ws.getRow(currentRow).height = ROW_HEIGHT;
      currentRow++;

      if (isFirstPage) {
        // Column headers (page 1 only): 2 rows
        writeHeaders(ws, currentRow);
        currentRow += 2;
      }

      // ── Write customer blocks for this page ────────────────────────────
      const customerTotalJRefs: string[] = [];

      for (const block of page) {
        const firstItemRow = currentRow;

        // Item rows
        for (let itemIndex = 0; itemIndex < block.items.length; itemIndex++) {
          const item = block.items[itemIndex];
          ws.getRow(currentRow).height = ROW_HEIGHT;

          if (itemIndex === 0) {
            const cCell = ws.getCell(`C${currentRow}`);
            cCell.value = block.consignee;
            cCell.font = { ...FONT };

            const dCell = ws.getCell(`D${currentRow}`);
            dCell.value = block.packageNumber;
            dCell.font = { ...FONT_BOLD };
          }

          const eCell = ws.getCell(`E${currentRow}`);
          eCell.value = item.quantity;
          eCell.font = { ...FONT };

          const fCell = ws.getCell(`F${currentRow}`);
          fCell.value = item.description;
          fCell.font = { ...FONT };

          const hCell = ws.getCell(`H${currentRow}`);
          hCell.value = 'X';
          hCell.font = { ...FONT };

          const iCell = ws.getCell(`I${currentRow}`);
          iCell.value = item.unitValue;
          iCell.font = { ...FONT };
          iCell.numFmt = CURRENCY_FORMAT;

          const jCell = ws.getCell(`J${currentRow}`);
          jCell.value = item.totalValue;
          jCell.font = { ...FONT };
          jCell.numFmt = CURRENCY_FORMAT;

          // Grid borders on all cells C-K
          applyGridBorders(ws, currentRow);
          currentRow++;
        }

        const lastItemRow = currentRow - 1;

        // ── Customer TOTAL row ─────────────────────────────────────────
        ws.getRow(currentRow).height = ROW_HEIGHT;

        const eTotal = ws.getCell(`E${currentRow}`);
        eTotal.value = block.totalQuantity;
        eTotal.font = { ...FONT_BOLD };

        const iTotal = ws.getCell(`I${currentRow}`);
        iTotal.value = 'TOTAL';
        iTotal.font = { ...FONT_BOLD };

        const jTotal = ws.getCell(`J${currentRow}`);
        if (block.items.length > 1) {
          jTotal.value = { formula: `SUM(J${firstItemRow}:J${lastItemRow})` };
        } else {
          jTotal.value = block.totalValue;
        }
        jTotal.font = { ...FONT_BOLD };
        jTotal.numFmt = CURRENCY_FORMAT;

        // Grid borders on TOTAL row too
        applyGridBorders(ws, currentRow);

        customerTotalJRefs.push(`J${currentRow}`);
        currentRow++;

        // Blank separator row (still part of the grid — gets borders)
        ws.getRow(currentRow).height = ROW_HEIGHT;
        applyGridBorders(ws, currentRow);
        currentRow++;
      }

      // ── Page SUBTOTAL row ────────────────────────────────────────────
      ws.getRow(currentRow).height = ROW_HEIGHT;

      const hSub = ws.getCell(`H${currentRow}`);
      hSub.value = 'SUBTOTAL';
      hSub.font = { ...FONT_BOLD };

      const iSub = ws.getCell(`I${currentRow}`);
      iSub.value = 'SUBTOTAL';
      iSub.font = { ...FONT_BOLD };

      const jSub = ws.getCell(`J${currentRow}`);
      jSub.value = { formula: customerTotalJRefs.join('+') };
      jSub.font = { ...FONT_BOLD };
      jSub.numFmt = CURRENCY_FORMAT;

      // SUBTOTAL has special border pattern (H/J merge visual)
      applySubtotalBorders(ws, currentRow);

      subtotalJRefs.push(`J${currentRow}`);
      currentRow++;

      // ── Grand TOTAL (last page only, when multiple pages) ────────────
      if (isLastPage && totalPages > 1) {
        ws.getRow(currentRow).height = ROW_HEIGHT;

        const iGrand = ws.getCell(`I${currentRow}`);
        iGrand.value = 'TOTAL';
        iGrand.font = { ...FONT_BOLD };

        const jGrand = ws.getCell(`J${currentRow}`);
        jGrand.value = { formula: subtotalJRefs.join('+') };
        jGrand.font = { ...FONT_BOLD };
        jGrand.numFmt = CURRENCY_FORMAT;

        // Same border pattern as SUBTOTAL
        applySubtotalBorders(ws, currentRow);
        currentRow++;
      }

      // ── 2 blank rows + signature (NO borders — outside the grid) ────
      ws.getRow(currentRow).height = ROW_HEIGHT;
      currentRow++;
      ws.getRow(currentRow).height = ROW_HEIGHT;
      currentRow++;

      // Signature lines (matching PDF: left under Consignatario, right under Valor Unit)
      ws.getRow(currentRow).height = ROW_HEIGHT;
      ws.getCell(`C${currentRow}`).value = '__________________';
      ws.getCell(`C${currentRow}`).font = { ...FONT };
      ws.getCell(`I${currentRow}`).value = '__________________';
      ws.getCell(`I${currentRow}`).font = { ...FONT };
      currentRow++;

      // Labels
      ws.getRow(currentRow).height = ROW_HEIGHT;
      ws.getCell(`C${currentRow}`).value = 'Nombre';
      ws.getCell(`C${currentRow}`).font = { ...FONT };
      ws.getCell(`I${currentRow}`).value = 'Firma';
      ws.getCell(`I${currentRow}`).font = { ...FONT };
      currentRow++;

      // Blank row between pages (not after last page)
      if (!isLastPage) {
        ws.getRow(currentRow).height = ROW_HEIGHT;
        currentRow++;
      }
    }

    // No white fill — showGridLines:false handles grid hiding.
    // Applying fill creates a visible "used range" outline in Numbers/Excel.

    // ── Generate & download ──────────────────────────────────────────────
    const timestamp = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '-');

    const filename = `Desarrollo_Export_${timestamp}_${orders.length}orders.xlsx`;

    const rawBuffer = await workbook.xlsx.writeBuffer();

    // Fix ExcelJS dimension bug: it calculates "D1:K…" instead of "C1:K…",
    // which causes Google Sheets to ignore all column C content on import.
    const fixedBuffer = await fixXlsxDimension(rawBuffer);

    const blob = new Blob([fixedBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    console.log(`✓ Desarrollo export complete: ${filename}`);
    return { success: true };
  } catch (error) {
    console.error('Export failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
