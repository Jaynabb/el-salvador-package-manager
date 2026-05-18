import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { exportOrdersToGoogleDocs, startNewGoogleDoc } from '../services/orderExportService';
import { exportOrdersToGoogleSheets, startNewGoogleSheet } from '../services/orderSheetsExportService';
import { exportOrdersToGoogleSheet } from '../services/orderExcelExportService';
import { extractItemsFromDocText, withRetry } from '../services/geminiService';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';
import type { ExtractedOrderData } from '../types';
import type { PackageItem } from '../types';
import { useToasts, ToastStack } from './Toast';

export interface OrderRow {
  id: string;
  packageNumber: string;
  date: string;
  consignee: string;
  pieces: number;
  weight: string;
  trackingNumber: string;
  merchantTrackingNumber?: string; // Tracking number from merchant (Amazon, Shein, etc.)
  orderNumber?: string; // Supplier order number (fallback if no tracking)
  company: string;
  value: number;
  parcelComp: string;
  carriers?: string[]; // Array of shipping carriers (USPS, UPS, FedEx, DHL, etc.)
  customerReceivedDate?: string; // Date when customer received package (manual input)
  dateDelivered?: string; // Date when package was delivered (manual input)
  screenshotUrls: string[]; // Array of Firebase Storage URLs (one customer can have multiple screenshots)
  items?: PackageItem[]; // Array of line items extracted from screenshots
  source?: string; // 'word-doc' for imported from Word document
  createdAt: Date;
}

export default function OrderManagement() {
  const { currentUser } = useAuth();
  const toast = useToasts();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingSheets, setExportingSheets] = useState(false);
  const [exportPhase, setExportPhase] = useState<string>('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showMachoteModal, setShowMachoteModal] = useState(false);
  const [machoteAction, setMachoteAction] = useState<'append' | 'fresh'>('append');
  const [showFilters, setShowFilters] = useState(false);
  const [showExtraColumns, setShowExtraColumns] = useState(() => {
    try { return JSON.parse(localStorage.getItem('importflow-show-extra-cols') || 'false'); } catch { return false; }
  });
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof OrderRow } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [importingDoc, setImportingDoc] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [extractionFailures, setExtractionFailures] = useState<Array<{ customer: string; screenshotIndex: number; reason: string }>>([]);
  const wordDocInputRef = React.useRef<HTMLInputElement>(null);

  // Filter state
  const [filterConsignee, setFilterConsignee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Sort state
  const [sortBy, setSortBy] = useState<'date' | 'value' | 'consignee' | 'packageNumber' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadOrders();
  }, [currentUser]);


  // Keyboard navigation for gallery
  useEffect(() => {
    if (!galleryOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGallery();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      } else if (e.key === 'ArrowRight') {
        nextImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryOpen, currentImageIndex, galleryImages.length]);

  const loadOrders = async () => {
    if (!currentUser?.organizationId) {
      console.warn('No organization ID available');
      setLoading(false);
      setLoadError('No organization linked to this account. Sign out and back in, or contact support.');
      return;
    }

    try {
      setLoading(true);
      setLoadError(null);

      const ordersRef = collection(db, 'organizations', currentUser.organizationId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);

      const loadedOrders: OrderRow[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as OrderRow));

      setOrders(loadedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error loading orders.';
      setLoadError(msg);
      toast.error('Could not load orders', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCellEdit = (rowId: string, field: keyof OrderRow, currentValue: any) => {
    setEditingCell({ rowId, field });
    setEditValue(String(currentValue || ''));
  };

  const handleCellSave = async () => {
    if (!editingCell || !currentUser?.organizationId) return;

    try {
      const orderRef = doc(db, 'organizations', currentUser.organizationId, 'orders', editingCell.rowId);

      // Convert value based on field type
      let value: any = editValue;
      if (editingCell.field === 'pieces' || editingCell.field === 'value') {
        value = parseFloat(editValue) || 0;
      }

      await updateDoc(orderRef, {
        [editingCell.field]: value
      });

      // Update local state
      setOrders(prev => prev.map(order =>
        order.id === editingCell.rowId
          ? { ...order, [editingCell.field]: value }
          : order
      ));

      setEditingCell(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving cell:', error);
      toast.error('Failed to save changes', error instanceof Error ? error.message : undefined);
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const openGallery = (images: string[], startIndex: number = 0) => {
    setGalleryImages(images);
    setCurrentImageIndex(startIndex);
    setGalleryOpen(true);
  };

  const closeGallery = () => {
    setGalleryOpen(false);
    setGalleryImages([]);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % galleryImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  // Drag-to-select state
  const isDragging = useRef(false);
  const dragMode = useRef<'select' | 'deselect'>('select');
  const dragTouched = useRef<Set<string>>(new Set());

  const handleRowSelect = (rowId: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId);
    } else {
      newSelected.add(rowId);
    }
    setSelectedRows(newSelected);
  };

  const handleDragStart = (rowId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragMode.current = selectedRows.has(rowId) ? 'deselect' : 'select';
    dragTouched.current = new Set([rowId]);
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (dragMode.current === 'select') next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  };

  const handleDragEnter = (rowId: string) => {
    if (!isDragging.current || dragTouched.current.has(rowId)) return;
    dragTouched.current.add(rowId);
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (dragMode.current === 'select') next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  };

  useEffect(() => {
    const handleDragEnd = () => {
      isDragging.current = false;
      dragTouched.current = new Set();
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = el?.closest('tr');
      const rowId = row?.getAttribute('data-row-id');
      if (rowId) handleDragEnter(rowId);
    };
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const handleSelectAll = () => {
    // Use sortedOrders which already has filters applied
    if (selectedRows.size === sortedOrders.length && sortedOrders.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(sortedOrders.map(o => o.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0 || !currentUser?.organizationId) return;

    const confirmed = confirm(`Delete ${selectedRows.size} selected row${selectedRows.size !== 1 ? 's' : ''}?`);
    if (!confirmed) return;

    try {
      for (const rowId of selectedRows) {
        const orderRef = doc(db, 'organizations', currentUser.organizationId, 'orders', rowId);
        await deleteDoc(orderRef);
      }

      const deletedCount = selectedRows.size;
      setOrders(prev => prev.filter(order => !selectedRows.has(order.id)));
      setSelectedRows(new Set());
      toast.success(`Deleted ${deletedCount} row${deletedCount !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error deleting rows:', error);
      toast.error('Failed to delete rows', error instanceof Error ? error.message : undefined);
    }
  };

  const handleMachoteExport = async (createNew: boolean) => {
    if (selectedRows.size === 0) {
      toast.warning('Select at least one row to export');
      return;
    }

    if (!currentUser?.organizationId) {
      toast.error('Organization not configured');
      return;
    }

    const selectedOrders = orders.filter(order => selectedRows.has(order.id));

    setExporting(true);
    setShowMachoteModal(false);

    try {
      // If user chose to create new, clear the active doc ID first
      if (createNew) {
        setExportPhase('Preparing new Machote…');
        await startNewGoogleDoc(currentUser.organizationId);
      }

      setExportPhase(`Generating Machote for ${selectedRows.size} order${selectedRows.size !== 1 ? 's' : ''}…`);

      // Export to Google Docs (pass user ID for tracking)
      const result = await exportOrdersToGoogleDocs(
        selectedOrders,
        currentUser.organizationId,
        currentUser.uid // Track who exported
      );

      if (result.success && result.docUrl) {
        // Success - open the doc
        setExportPhase('Opening Google Doc…');
        window.open(result.docUrl, '_blank');
        const action = createNew ? 'Created new Machote' : (result.isNew ? 'Created new Machote' : 'Added to existing Machote');
        const count = selectedRows.size;
        toast.success(
          `Exported ${count} order${count !== 1 ? 's' : ''}`,
          `${action} — opening Google Doc`
        );

        // Clear selections after successful export
        setSelectedRows(new Set());
      } else {
        toast.error('Export failed', result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setExporting(false);
      setExportPhase('');
    }
  };


  const handleExportToSheets = async () => {
    if (selectedRows.size === 0) {
      toast.warning('Select at least one order to export');
      return;
    }

    const selectedOrders = orders.filter(order => selectedRows.has(order.id));

    // Check if orders have items
    const ordersWithoutItems = selectedOrders.filter(o => !o.items || o.items.length === 0);
    if (ordersWithoutItems.length > 0) {
      const proceed = confirm(
        `⚠️ ${ordersWithoutItems.length} order(s) have no line-item details.\n\n` +
        `They will be exported as single rows with totals only.\n\n` +
        `Continue export?`
      );
      if (!proceed) return;
    }

    setExportingSheets(true);
    setExportPhase(`Building customs sheet for ${selectedOrders.length} order${selectedOrders.length !== 1 ? 's' : ''}…`);
    try {
      // Re-read the user profile fresh from Firestore — currentUser is loaded once at
      // login and won't reflect a Settings save until the next session. Reading here
      // guarantees the Gestor # and display name reflect what's saved right now.
      let freshGestorNumber: string | undefined = currentUser?.gestorNumber;
      let freshDisplayName: string | undefined = currentUser?.displayName;
      if (currentUser?.uid) {
        try {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            freshGestorNumber = data.gestorNumber ?? freshGestorNumber;
            freshDisplayName = data.displayName ?? freshDisplayName;
          }
        } catch (err) {
          console.warn('Could not refresh user profile from Firestore:', err);
        }
      }

      const result = await exportOrdersToGoogleSheet(
        selectedOrders,
        currentUser?.organizationId || '',
        currentUser?.uid,
        {
          gestorNumber: freshGestorNumber,
          displayName: freshDisplayName,
        },
        currentUser?.email,
      );

      if (result.success && result.sheetUrl) {
        // Count total items exported
        const totalItems = selectedOrders.reduce((sum, o) =>
          sum + (o.items?.length || 1), 0
        );

        // Clear selections after successful export
        setSelectedRows(new Set());

        // Open the Google Sheet in a new tab (same pattern as Machote)
        setExportPhase('Opening Google Sheet…');
        window.open(result.sheetUrl, '_blank');

        toast.success(
          `Exported ${selectedOrders.length} order${selectedOrders.length !== 1 ? 's' : ''} (${totalItems} line items)`,
          'Google Sheet opened in a new tab — ready for customs submission.'
        );
      } else {
        toast.error('Export failed', result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Customs export error:', error);
      toast.error('Export failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setExportingSheets(false);
      setExportPhase('');
    }
  };

  /**
   * Run screenshot extraction on the server.
   *
   * Why: prior to this, every user's browser called Gemini directly. Users on
   * slower networks (Julio in El Salvador) saw transient failures, rate limits,
   * and dropped items that headquarters users never hit. Moving extraction to a
   * Cloud Function puts every user on the same runtime — same region, same retry
   * policy, same quota pool — so the SaaS behaves identically regardless of
   * location.
   *
   * Returns one entry per input image, in the same order.
   */
  const extractScreenshotsViaServer = async (
    images: Array<{ base64: string; contentType: string }>,
    label: (idx: number) => string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Array<{ ok: true; data: ExtractedOrderData } | { ok: false; error: string }>> => {
    if (!functions) throw new Error('Cloud Functions not initialized — check Firebase config.');
    const extract = httpsCallable<
      { images: Array<{ base64: string; mimeType: string; clientIdx: number }>; lenient: boolean },
      { results: Array<{ clientIdx: number; ok: true; data: ExtractedOrderData } | { clientIdx: number; ok: false; error: string }> }
    >(functions, 'extractScreenshotBatch');

    const CHUNK_SIZE = 10;
    const out: Array<{ ok: true; data: ExtractedOrderData } | { ok: false; error: string }> = new Array(images.length);
    let completed = 0;

    for (let i = 0; i < images.length; i += CHUNK_SIZE) {
      const slice = images.slice(i, i + CHUNK_SIZE);
      const payload = slice.map((img, j) => ({
        base64: img.base64,
        mimeType: img.contentType,
        clientIdx: i + j,
      }));

      // Wrap the callable invocation itself in retry — if the function gateway
      // returns 429/5xx (rare), retry the whole batch once.
      const response = await withRetry(
        () => extract({ images: payload, lenient: true }),
        { label: `extractScreenshotBatch [${i}-${i + slice.length - 1}]`, maxAttempts: 2 }
      );

      for (const r of response.data.results) {
        if (r.ok) out[r.clientIdx] = { ok: true, data: r.data };
        else out[r.clientIdx] = { ok: false, error: r.error };
      }

      completed += slice.length;
      onProgress?.(completed, images.length);
    }

    return out;
  };

  const handleWordDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.organizationId) return;

    // Reset input so the same file can be re-selected
    e.target.value = '';

    setImportingDoc(true);
    setImportProgress('Reading document...');
    setExtractionFailures([]);
    const failures: Array<{ customer: string; screenshotIndex: number; reason: string }> = [];
    try {
      console.log(`📄 handleWordDocUpload starting...`);

      const originalBuffer = await file.arrayBuffer();
      console.log(`📄 File size: ${originalBuffer.byteLength} bytes`);

      // Clone the ArrayBuffer so mammoth and JSZip each get their own copy
      const mammothBuffer = originalBuffer.slice(0);
      const zipBuffer = originalBuffer.slice(0);

      // Step 1: Extract text with mammoth
      const textResult = await mammoth.extractRawText({ arrayBuffer: mammothBuffer });
      const docText = textResult.value;

      console.log(`📄 Word doc text: ${docText.length} chars`);
      console.log(`📄 Text preview: ${docText.substring(0, 200)}`);

      // Step 2: Extract images directly from the docx ZIP using JSZip (works in all browsers)
      console.log(`📄 About to call JSZip.loadAsync...`);
      let zip: any;
      try {
        zip = await JSZip.loadAsync(zipBuffer);
        console.log(`📄 JSZip loaded OK, files: ${Object.keys(zip.files).length}`);
      } catch (zipErr) {
        console.error(`📄 JSZip FAILED:`, zipErr);
        console.error(`JSZip failed:`, zipErr);
        throw zipErr;
      }
      const mediaFiles = Object.keys(zip.files)
        .filter(f => f.startsWith('word/media/') && /\.(jpg|jpeg|png|gif|bmp)$/i.test(f))
        .sort((a, b) => {
          // Sort numerically: image1, image2, ..., image10, image11
          const numA = parseInt(a.match(/image(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/image(\d+)/)?.[1] || '0');
          return numA - numB;
        });

      // Also parse document.xml to get the actual image order as they appear in the doc
      const docXml = await zip.file('word/document.xml')?.async('string');
      const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');

      let orderedImageFiles = mediaFiles; // fallback to filename sort
      if (docXml && relsXml) {
        // Build rId -> filename map
        const relMap: Record<string, string> = {};
        const relRegex = /Id="(rId\d+)"[^>]*Target="(media\/[^"]+)"/g;
        let relMatch;
        while ((relMatch = relRegex.exec(relsXml)) !== null) {
          relMap[relMatch[1]] = 'word/' + relMatch[2];
        }

        // Find image refs in document order
        const imgRefRegex = /r:embed="(rId\d+)"/g;
        let imgRef;
        const docOrder: string[] = [];
        while ((imgRef = imgRefRegex.exec(docXml)) !== null) {
          const mapped = relMap[imgRef[1]];
          if (mapped && mediaFiles.includes(mapped)) {
            docOrder.push(mapped);
          }
        }
        if (docOrder.length > 0) orderedImageFiles = docOrder;
      }

      console.log(`📄 Found ${orderedImageFiles.length} images in docx ZIP`);

      // Load all images as base64
      const allImages: { base64: string; contentType: string }[] = [];
      for (const imgFile of orderedImageFiles) {
        const zipEntry = zip.file(imgFile);
        if (!zipEntry) { console.warn(`Missing: ${imgFile}`); continue; }
        const base64 = await zipEntry.async('base64');
        const ext = imgFile.split('.').pop()?.toLowerCase() || 'jpg';
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        allImages.push({ base64, contentType });
      }

      console.log(`📄 Loaded ${allImages.length} images as base64`);

      // Step 3: Permissive machote detection. Instead of gating on specific layouts
      // (which breaks every time a new customer brings a new format), we just look
      // for distinct (number, name) pairs anywhere in the doc, in any order:
      //   "Paquete #1 CESAR"          ✓
      //   "CESAR CUBIAS #1"           ✓ (Julio's carga)
      //   "1 Julio Smith"             ✓
      //   "#1 CESAR"                  ✓
      // If we find 2+ distinct package numbers near uppercase-leading names, it's
      // a multi-customer machote. Otherwise fall back to single-customer prompt.
      const NAME_FRAG = /[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+){0,3}/.source;
      // Package identifier token — accepts whatever Julio (or any customer) puts next to
      // a name in the Machote: pure digits ("5", "8240"), warehouse codes ("W12345",
      // "WH-001"), mixed alphanumeric ("ABC123"), pure letters ("ABC"). 1-16 chars,
      // uppercase alphanumeric + internal dashes. Must start with letter or digit. Same
      // shape as PKG_TOKEN in tryMatch() below — keep in sync.
      const PKG_TOKEN_FRAG = String.raw`[A-Z0-9][A-Z0-9-]{0,15}`;
      const findDistinctPackageNumbers = (text: string): Set<string> => {
        const found = new Set<string>();
        // name-then-number: "CESAR CUBIAS #1" or "CESAR CUBIAS W12345"
        const reNameNum = new RegExp(`(${NAME_FRAG})\\s+(?:Paquete\\s+)?#?\\s*(${PKG_TOKEN_FRAG})\\b`, 'g');
        for (const m of text.matchAll(reNameNum)) found.add(m[2]);
        // number-then-name: "Paquete #1 CESAR" or "W12345 CESAR CUBIAS"
        const reNumName = new RegExp(`(?:Paquete\\s+)?#?\\s*(${PKG_TOKEN_FRAG})\\b\\s+(${NAME_FRAG})`, 'g');
        for (const m of text.matchAll(reNumName)) found.add(m[1]);
        return found;
      };
      const distinctPkgs = findDistinctPackageNumbers(docText);
      const isMachote = distinctPkgs.size >= 2 && allImages.length > 0;
      const hasImages = allImages.length > 0;

      console.log(`📄 isMachote=${isMachote}, hasImages=${hasImages} (distinctPackageNumbers=${distinctPkgs.size}, images=${allImages.length})`);

      const ordersRef = collection(db, 'organizations', currentUser.organizationId, 'orders');

      if (isMachote) {
        // --- Machote format: parse text to find customer blocks, assign images by document order ---

        // Parse customer blocks from document.xml text nodes + image refs
        // Text events and image events in document order
        interface DocEvent { type: 'text' | 'image'; value: string; pos: number }
        const events: DocEvent[] = [];

        if (docXml) {
          const textRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
          let tm;
          while ((tm = textRegex.exec(docXml)) !== null) {
            events.push({ type: 'text', value: tm[1], pos: tm.index });
          }

          // Build rId -> image index map
          const relMap2: Record<string, string> = {};
          if (relsXml) {
            const relRegex2 = /Id="(rId\d+)"[^>]*Target="(media\/[^"]+)"/g;
            let rm;
            while ((rm = relRegex2.exec(relsXml)) !== null) {
              relMap2[rm[1]] = 'word/' + rm[2];
            }
          }

          const imgRefRegex2 = /r:embed="(rId\d+)"/g;
          let ir;
          let imgSeqIdx = 0;
          while ((ir = imgRefRegex2.exec(docXml)) !== null) {
            const mapped = relMap2[ir[1]];
            if (mapped && orderedImageFiles.includes(mapped)) {
              events.push({ type: 'image', value: String(imgSeqIdx), pos: ir.index });
              imgSeqIdx++;
            }
          }
        }

        events.sort((a, b) => a.pos - b.pos);

        interface MachoteBlock {
          name: string;
          packageNumber: string;
          carrier: string;
          trackingLast4: string;
          value: number;
          imageIndices: number[];
        }

        const blocks: MachoteBlock[] = [];
        let currentBlock: MachoteBlock | null = null;
        let textBuffer = '';

        // Unified parser: try each pattern in order of specificity. First match wins.
        // Strongest signal first (explicit "Paquete" anchor) → weakest (bare name + number).
        // Same customer can appear with different package numbers (e.g. MARIO MARROQUIN
        // #5, #6, #7) — dedupe on packageNumber, not name.
        //
        // The captured package identifier (`PKG_TOKEN`) is whatever appears next to the
        // customer name in the Machote. Per Jay's 5/17 direction: not limited to digits
        // or W-codes — any series of uppercase letters/digits (with internal dashes) up
        // to 16 chars qualifies. Examples: "1", "8240", "W12345", "WH-001", "ABC123",
        // "ABC". Whatever lands here flows into the Desarrollo "No de PK" cell — that's
        // the operator's "control interno" identifier. Same shape as PKG_TOKEN_FRAG used
        // in findDistinctPackageNumbers above — keep them in sync.
        const PKG_TOKEN = String.raw`([A-Z0-9][A-Z0-9-]{0,15})`;
        const tryMatch = (buf: string): { name: string; number: string } | null => {
          // 1. Paquete format: "...Paquete #N" with name as preceding capitalized text
          const pMatch = buf.match(new RegExp(String.raw`Paquete\s*#?\s*${PKG_TOKEN}\b`, 'i'));
          if (pMatch) {
            const pIdx = buf.lastIndexOf('Paquete', pMatch.index! + pMatch[0].length);
            const before = buf.substring(0, pIdx).trim();
            // Strip out tokens that aren't names (carriers, valor, tracking) so name lookback works
            const segments = before.split(/(?:VALOR|VAR|USPS|UPS|FedEx|DHL|SpeedX|OnTrac|LaserShip|Amazon\s*Logistics?|#\d{3,}|\$[\d,.]+|:)/i)
              .filter(s => s.trim().length > 1);
            let name = 'Unknown';
            if (segments.length > 0) {
              const cand = segments[segments.length - 1].trim().replace(/\s+/g, ' ');
              if (cand.length > 1 && cand.length < 60) name = cand;
            }
            return { name, number: pMatch[1] };
          }
          // 2. Name then "#N": "CESAR CUBIAS #1" or "CESAR CUBIAS #W12345"
          const nhMatch = buf.match(new RegExp(String.raw`([A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+){0,3})\s+#\s*${PKG_TOKEN}\b`));
          if (nhMatch) return { name: nhMatch[1].trim().replace(/\s+/g, ' '), number: nhMatch[2] };
          // 3. "#N Name": "#1 CESAR" or "#W12345 CESAR"
          const hnMatch = buf.match(new RegExp(String.raw`#\s*${PKG_TOKEN}\b\s+([A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+){0,3})`));
          if (hnMatch) return { name: hnMatch[2].trim().replace(/\s+/g, ' '), number: hnMatch[1] };
          // 4. Bare number/code then name: "1 CESAR CUBIAS" or "W12345 CESAR CUBIAS"
          const nNameMatch = buf.match(new RegExp(String.raw`(?:^|\s)${PKG_TOKEN}\s+([A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+){0,3})`));
          if (nNameMatch) return { name: nNameMatch[2].trim().replace(/\s+/g, ' '), number: nNameMatch[1] };
          // 5. Name then bare number/code: "CESAR CUBIAS 1" or "CESAR CUBIAS W12345" (no `#` marker)
          const nameNMatch = buf.match(new RegExp(String.raw`([A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.'-]+){0,3})\s+${PKG_TOKEN}\b`));
          if (nameNMatch) return { name: nameNMatch[1].trim().replace(/\s+/g, ' '), number: nameNMatch[2] };
          return null;
        };

        for (const ev of events) {
          if (ev.type === 'text') {
            textBuffer += ev.value + ' ';
            const m = tryMatch(textBuffer);
            if (m && (!currentBlock || currentBlock.packageNumber !== m.number)) {
              currentBlock = {
                name: m.name,
                packageNumber: m.number,
                carrier: '',
                trackingLast4: '',
                value: 0,
                imageIndices: [],
              };
              blocks.push(currentBlock);
              textBuffer = '';
            }
          } else if (ev.type === 'image' && currentBlock) {
            currentBlock.imageIndices.push(parseInt(ev.value));
          }
        }

        // For docs that use the explicit Paquete format, enrich blocks with carrier,
        // tracking-last-4, and VALOR pulled from text around each "Paquete #N" anchor.
        // Other formats don't carry this metadata inline; fields stay empty and can be
        // filled by Gemini extraction or manual edit.
        if (/Paquete\s*#?\s*\d+/i.test(docText)) {
          const rawLines = docText.replace(/\s+/g, ' ');
          for (const block of blocks) {
            const paquetePattern = new RegExp(`Paquete\\s*#${block.packageNumber}\\b([\\s\\S]{0,200})`, 'i');
            const afterMatch = rawLines.match(paquetePattern);
            if (afterMatch) {
              const afterText = afterMatch[1];
              const cm = afterText.match(/\b(USPS|UPS|FedEx|DHL|SpeedX|OnTrac|LaserShip)\s*#?\s*(\d{4})\b/i);
              if (cm) { block.carrier = cm[1]; block.trackingLast4 = cm[2]; }
              const vm = afterText.match(/VALO?R\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) || afterText.match(/\$\s*([\d,]+\.?\d*)/);
              if (vm) block.value = parseFloat(vm[1].replace(',', ''));
            }
            if (!block.carrier) {
              const beforePattern = new RegExp(`([\\s\\S]{0,200})Paquete\\s*#${block.packageNumber}\\b`, 'i');
              const beforeMatch = rawLines.match(beforePattern);
              if (beforeMatch) {
                const bText = beforeMatch[1];
                const cm2 = bText.match(/\b(USPS|UPS|FedEx|DHL|SpeedX|OnTrac|LaserShip)\s*#?\s*(\d{4})\b/i);
                if (cm2) { block.carrier = cm2[1]; block.trackingLast4 = cm2[2]; }
              }
            }
          }
        }

        for (const block of blocks) {
          console.log(`📦 #${block.packageNumber}: ${block.name}, ${block.imageIndices.length} imgs`);
        }

        if (blocks.length === 0) {
          toast.warning('No customer blocks found in the Machote document');
          return;
        }

        // Send all screenshots to the server-side extraction function. Server runs
        // them with its own retry + concurrency policy, so every user gets the same
        // execution path regardless of network/location/device. The client only
        // uploads bytes and waits for the result.
        const totalScreenshots = blocks.reduce((sum, b) => sum + b.imageIndices.length, 0);
        console.log(`📸 Sending ${totalScreenshots} screenshots across ${blocks.length} customers to server extractor...`);
        setImportProgress(`Found ${blocks.length} customers, ${totalScreenshots} screenshots. Analyzing on server...`);

        // Build a flat list of {idx, image} so we can route results back to the right block
        const flatImages: Array<{ base64: string; contentType: string }> = [];
        const idxToBlock = new Map<number, MachoteBlock>();
        for (const block of blocks) {
          for (const imgIdx of block.imageIndices) {
            const img = allImages[imgIdx];
            if (!img) {
              failures.push({ customer: block.name, screenshotIndex: imgIdx, reason: 'image data missing' });
              continue;
            }
            idxToBlock.set(flatImages.length, block);
            flatImages.push(img);
          }
        }

        const serverResults = await extractScreenshotsViaServer(
          flatImages,
          (idx) => `flat #${idx}`,
          (done, total) => setImportProgress(`Analyzing screenshot ${done}/${total} on server...`)
        );

        // Route results back to blocks
        const itemsByBlock = new Map<MachoteBlock, PackageItem[]>();
        for (let k = 0; k < serverResults.length; k++) {
          const r = serverResults[k];
          const block = idxToBlock.get(k);
          if (!block) continue;
          if (r.ok) {
            if (r.data.items && r.data.items.length > 0) {
              if (!itemsByBlock.has(block)) itemsByBlock.set(block, []);
              itemsByBlock.get(block)!.push(...r.data.items);
            }
          } else {
            console.warn(`⚠️ Screenshot #${k} failed for ${block.name}:`, r.error);
            failures.push({ customer: block.name, screenshotIndex: k, reason: r.error.slice(0, 200) });
          }
        }

        let createdCount = 0;
        let totalItems = 0;

        for (const block of blocks) {
          const allItemsForBlock = itemsByBlock.get(block) || [];

          // Upload screenshots to Firebase Storage
          const screenshotUrls: string[] = [];
          for (const imgIdx of block.imageIndices) {
            try {
              const img = allImages[imgIdx];
              if (!img) continue;
              const ext = img.contentType.split('/')[1] || 'jpg';
              const byteChars = atob(img.base64);
              const byteArray = new Uint8Array(byteChars.length);
              for (let k = 0; k < byteChars.length; k++) {
                byteArray[k] = byteChars.charCodeAt(k);
              }
              const blob = new Blob([byteArray], { type: img.contentType });

              const timestamp = Date.now();
              const fileName = `screenshots/org_${currentUser.organizationId}/machote_pkg${block.packageNumber}_${imgIdx}_${timestamp}.${ext}`;
              const storageRef = ref(storage, fileName);
              await uploadBytes(storageRef, blob);
              const url = await getDownloadURL(storageRef);
              screenshotUrls.push(url);
            } catch (uploadErr) {
              console.warn(`Failed to upload screenshot for ${block.name}:`, uploadErr);
            }
          }

          const totalPieces = allItemsForBlock.reduce((s, item) => s + (item.quantity || 0), 0);
          const itemsTotal = allItemsForBlock.reduce((s, item) => s + (item.totalValue || 0), 0);

          const orderData = {
            packageNumber: `Paquete #${block.packageNumber}`,
            date: new Date().toISOString().split('T')[0],
            consignee: block.name,
            pieces: totalPieces,
            weight: '',
            trackingNumber: block.trackingLast4 || '',
            company: '',
            value: block.value > 0 ? block.value : itemsTotal,
            parcelComp: block.carrier || '',
            carriers: block.carrier ? [block.carrier] : [],
            screenshotUrls,
            items: allItemsForBlock,
            status: 'pending-review',
            extractionStatus: allItemsForBlock.length > 0 ? 'completed' : 'pending',
            source: 'word-doc',
            sourceFileName: file.name,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          setImportProgress(`Saving order ${createdCount + 1}/${blocks.length}: ${block.name}...`);
          await addDoc(ordersRef, orderData);
          createdCount++;
          totalItems += allItemsForBlock.length;
        }

        await loadOrders();

        const failureLine = failures.length > 0
          ? `\n\n${failures.length} of ${totalScreenshots} screenshots could not be read (see banner below) — items from those screenshots are missing from totals.`
          : '';
        toast.success(
          `Machote imported — ${createdCount} order${createdCount !== 1 ? 's' : ''}, ${totalItems} items`,
          `From ${totalScreenshots} screenshots. Review the orders below, then export to Desarrollo.${failureLine}`
        );
      } else if (hasImages) {
        // --- Doc with images but no Paquete # pattern: import as a single "Unknown" order,
        // user can edit the consignee in the table after import. No blocking prompt. ---
        const customerName = 'Unknown';
        toast.info(
          'Couldn’t auto-detect a customer in the doc',
          'Importing as "Unknown" — edit the consignee in the table after extraction finishes.'
        );

        setImportProgress(`Processing ${allImages.length} screenshots on server...`);
        const allItemsForOrder: PackageItem[] = [];

        const serverResults = await extractScreenshotsViaServer(
          allImages,
          (idx) => `flat #${idx} (${customerName})`,
          (done, total) => setImportProgress(`Analyzing screenshot ${done}/${total} on server...`)
        );

        for (let k = 0; k < serverResults.length; k++) {
          const r = serverResults[k];
          if (r.ok && r.data.items && r.data.items.length > 0) {
            allItemsForOrder.push(...r.data.items);
          } else if (!r.ok) {
            console.warn(`⚠️ Screenshot #${k} failed:`, r.error);
            failures.push({ customer: customerName, screenshotIndex: k, reason: r.error.slice(0, 200) });
          }
        }

        // Upload screenshots to Storage
        const screenshotUrls: string[] = [];
        for (let i = 0; i < allImages.length; i++) {
          try {
            const img = allImages[i];
            const ext = img.contentType.split('/')[1] || 'jpg';
            const byteChars = atob(img.base64);
            const byteArray = new Uint8Array(byteChars.length);
            for (let k = 0; k < byteChars.length; k++) byteArray[k] = byteChars.charCodeAt(k);
            const blob = new Blob([byteArray], { type: img.contentType });
            const timestamp = Date.now();
            const fileName = `screenshots/org_${currentUser.organizationId}/doc_${i}_${timestamp}.${ext}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, blob);
            screenshotUrls.push(await getDownloadURL(storageRef));
          } catch (err) {
            console.warn(`Failed to upload image ${i}:`, err);
          }
        }

        // Get next package number
        const existingOrders = await getDocs(query(ordersRef, orderBy('createdAt', 'desc')));
        let highestPkg = 0;
        existingOrders.docs.forEach(d => {
          const match = (d.data().packageNumber || '').match(/Paquete #(\d+)/i);
          if (match) highestPkg = Math.max(highestPkg, parseInt(match[1]));
        });

        const totalPieces = allItemsForOrder.reduce((s, item) => s + (item.quantity || 0), 0);
        const itemsTotal = allItemsForOrder.reduce((s, item) => s + (item.totalValue || 0), 0);

        const orderData = {
          packageNumber: `Paquete #${highestPkg + 1}`,
          date: new Date().toISOString().split('T')[0],
          consignee: customerName,
          pieces: totalPieces,
          weight: '',
          trackingNumber: '',
          company: '',
          value: itemsTotal,
          parcelComp: '',
          carriers: [],
          screenshotUrls,
          items: allItemsForOrder,
          status: 'pending-review',
          extractionStatus: allItemsForOrder.length > 0 ? 'completed' : 'pending',
          source: 'word-doc',
          sourceFileName: file.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await addDoc(ordersRef, orderData);
        await loadOrders();

        const failureLineDoc = failures.length > 0
          ? `\n\n${failures.length} of ${allImages.length} screenshots could not be read (see banner below) — items from those screenshots are missing from the total.`
          : '';
        toast.success(
          `Doc imported — order for ${customerName}`,
          `${allItemsForOrder.length} items from ${allImages.length} screenshots. Review the order below, then export to Desarrollo.${failureLineDoc}`
        );
      } else {
        // --- Plain text only (no images): extract text and send to Gemini.
        // Default to "Unknown"; user edits in the table. No blocking prompt. ---
        const customerName = 'Unknown';
        toast.info(
          'Couldn’t auto-detect a customer in the doc',
          'Importing as "Unknown" — edit the consignee in the table after extraction finishes.'
        );

        const extracted = await extractItemsFromDocText(docText, customerName);

        if (!extracted.customers || extracted.customers.length === 0) {
          toast.warning('No items could be extracted from the document');
          return;
        }

        // Get next package number
        const existingOrders = await getDocs(query(ordersRef, orderBy('createdAt', 'desc')));
        let highestPkg = 0;
        existingOrders.docs.forEach(d => {
          const match = (d.data().packageNumber || '').match(/Paquete #(\d+)/i);
          if (match) highestPkg = Math.max(highestPkg, parseInt(match[1]));
        });

        let createdCount = 0;
        let totalItems = 0;

        for (const customer of extracted.customers) {
          if (!customer.items || customer.items.length === 0) continue;

          highestPkg++;
          const orderData = {
            packageNumber: `Paquete #${highestPkg}`,
            date: new Date().toISOString().split('T')[0],
            consignee: customer.name,
            pieces: customer.totalPieces,
            weight: '',
            trackingNumber: '',
            company: '',
            value: customer.orderTotal,
            parcelComp: '',
            carriers: [],
            screenshotUrls: [],
            items: customer.items,
            status: 'pending-review',
            extractionStatus: 'completed',
            source: 'word-doc',
            sourceFileName: file.name,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await addDoc(ordersRef, orderData);
          createdCount++;
          totalItems += customer.items.length;
        }

        await loadOrders();

        toast.success(
          `Word doc imported — ${createdCount} order${createdCount !== 1 ? 's' : ''}, ${totalItems} items`,
          'Review the orders below, then export to Desarrollo.'
        );
      }
    } catch (error) {
      console.error('Word doc import error:', error);
      toast.error('Import failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setImportingDoc(false);
      setImportProgress('');
      if (failures.length > 0) setExtractionFailures(failures);
    }
  };

  const handleStartNewSheet = async () => {
    if (!currentUser?.organizationId) {
      toast.error('Organization not configured');
      return;
    }

    const confirmed = confirm(
      'Start New Customs Sheet?\n\n' +
      'This will disconnect the current customs sheet.\n\n' +
      'You will need to:\n' +
      '1. Duplicate the customs template\n' +
      '2. Update the sheet ID in Settings\n\n' +
      'Continue?'
    );
    if (!confirmed) return;

    try {
      await startNewGoogleSheet(currentUser.organizationId);
      toast.info(
        'Customs sheet disconnected',
        'Next steps:\n1. Open the customs template, then File → Make a copy\n2. Copy the new sheet ID from the URL\n3. Paste it into Settings → Customs Sheet ID',
        0
      );
    } catch (error) {
      console.error('Error starting new sheet:', error);
      toast.error('Failed to disconnect sheet', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const renderCell = (order: OrderRow, field: keyof OrderRow) => {
    const isEditing = editingCell?.rowId === order.id && editingCell?.field === field;
    const value = order[field];

    // Skip id, createdAt, screenshotUrls, orderNumber, carriers, items (these aren't directly displayed in table)
    if (field === 'id' || field === 'createdAt' || field === 'screenshotUrls' || field === 'orderNumber' || field === 'carriers' || field === 'items') return null;

    // Special handling for Date Delivered input
    if (field === 'dateDelivered') {
      if (isEditing) {
        return (
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCellSave();
              if (e.key === 'Escape') handleCellCancel();
            }}
            autoFocus
            className="w-full px-2 py-1 bg-slate-600 border border-blue-500 rounded text-white focus:outline-none"
          />
        );
      }
      return (
        <div
          onClick={() => handleCellEdit(order.id, field, value)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-600 rounded min-h-[32px]"
          title="Click to enter date"
        >
          {value || '-'}
        </div>
      );
    }

    // Special handling for Customer Received Date dropdown
    if (field === 'customerReceivedDate') {
      if (isEditing) {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCellSave();
              if (e.key === 'Escape') handleCellCancel();
            }}
            autoFocus
            className="w-full px-2 py-1 bg-slate-600 border border-blue-500 rounded text-white focus:outline-none"
          >
            <option value="">-</option>
            <option value="Yes">Yes</option>
          </select>
        );
      }
      return (
        <div
          onClick={() => handleCellEdit(order.id, field, value)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-600 rounded min-h-[32px]"
          title="Click to select"
        >
          {value || '-'}
        </div>
      );
    }

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCellSave();
            if (e.key === 'Escape') handleCellCancel();
          }}
          onBlur={handleCellSave}
          autoFocus
          className="w-full px-2 py-1 bg-slate-600 border border-blue-500 rounded text-white focus:outline-none"
        />
      );
    }

    // Special handling for merchant tracking number with fallback logic
    let displayValue: string;
    if (field === 'merchantTrackingNumber') {
      // Priority: merchantTrackingNumber → orderNumber → manual input prompt
      if (order.merchantTrackingNumber) {
        displayValue = order.merchantTrackingNumber;
      } else if (order.orderNumber) {
        displayValue = `Order #${order.orderNumber}`;
      } else {
        displayValue = '(click to enter)';
      }
    } else if (field === 'value' && value) {
      // Format value field with dollar sign
      displayValue = `$${Number(value).toFixed(2)}`;
    } else {
      displayValue = value ? String(value) : '-';
    }

    return (
      <div
        onClick={() => handleCellEdit(order.id, field, value)}
        className="px-2 py-1 cursor-pointer hover:bg-slate-600 rounded min-h-[32px]"
        title="Click to edit"
      >
        {displayValue}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <ToastStack toasts={toast.toasts} dismiss={toast.dismiss} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Order Management</h1>
            <p className="text-slate-400 text-sm">Loading orders…</p>
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="border-b border-slate-700 px-4 py-3 bg-slate-700/50">
            <div className="h-4 w-32 bg-slate-600 rounded animate-pulse"></div>
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="border-b border-slate-700 last:border-b-0 px-4 py-3 flex items-center gap-4"
            >
              <div className="w-4 h-4 bg-slate-700 rounded animate-pulse"></div>
              <div className="w-16 h-16 bg-slate-700 rounded animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 bg-slate-700 rounded animate-pulse"></div>
                <div className="h-3 w-1/2 bg-slate-700 rounded animate-pulse"></div>
              </div>
              <div className="h-3 w-16 bg-slate-700 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <ToastStack toasts={toast.toasts} dismiss={toast.dismiss} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Order Management</h1>
            <p className="text-slate-400 text-sm">Could not load orders</p>
          </div>
        </div>
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 max-w-2xl">
          <h3 className="text-red-100 font-semibold mb-2">We couldn't reach your orders</h3>
          <p className="text-red-200/90 text-sm mb-4 font-mono break-words">{loadError}</p>
          <button
            onClick={loadOrders}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Apply filters and sorting
  const filteredOrders = orders.filter(order => {
    // Filter by consignee
    if (filterConsignee && !order.consignee.toLowerCase().includes(filterConsignee.toLowerCase())) {
      return false;
    }

    // Filter by date range
    if (filterDateFrom && order.date < filterDateFrom) {
      return false;
    }
    if (filterDateTo && order.date > filterDateTo) {
      return false;
    }

    return true;
  });

  // Apply sorting
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'value':
        comparison = (a.value || 0) - (b.value || 0);
        break;
      case 'consignee':
        comparison = (a.consignee || '').localeCompare(b.consignee || '');
        break;
      case 'packageNumber':
        comparison = (a.packageNumber || '').localeCompare(b.packageNumber || '');
        break;
      default:
        return 0;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const activeFilterCount = [filterDateFrom, filterDateTo, sortBy !== 'none' ? sortBy : ''].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <ToastStack toasts={toast.toasts} dismiss={toast.dismiss} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Order Management</h1>
          <p className="text-slate-400 text-sm">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Extraction failure banner — surfaces silent screenshot failures so totals never differ between runs without the user knowing why */}
      {extractionFailures.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-amber-200 font-semibold text-sm mb-1">
                ⚠️ {extractionFailures.length} screenshot{extractionFailures.length !== 1 ? 's' : ''} could not be read
              </h3>
              <p className="text-amber-200/80 text-xs mb-2">
                Items from these screenshots are missing from the order totals. Re-run the import (or add items manually) to recover them.
              </p>
              <ul className="text-amber-100/90 text-xs space-y-1 max-h-32 overflow-y-auto">
                {extractionFailures.slice(0, 20).map((f, i) => (
                  <li key={i} className="font-mono">
                    {f.customer} (img #{f.screenshotIndex}): {f.reason}
                  </li>
                ))}
                {extractionFailures.length > 20 && (
                  <li className="italic">…and {extractionFailures.length - 20} more (see browser console)</li>
                )}
              </ul>
            </div>
            <button
              onClick={() => setExtractionFailures([])}
              className="text-amber-300 hover:text-amber-100 text-lg leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filterConsignee}
              onChange={(e) => setFilterConsignee(e.target.value)}
              placeholder="Search by name..."
              className="w-full pl-9 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            {filterConsignee && (
              <button onClick={() => setFilterConsignee('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm">
                ✕
              </button>
            )}
          </div>

          {/* Filters toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-2 whitespace-nowrap ${
              showFilters || activeFilterCount > 0 ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-white/20 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* More Columns toggle */}
          <button
            onClick={() => {
              const next = !showExtraColumns;
              setShowExtraColumns(next);
              localStorage.setItem('importflow-show-extra-cols', JSON.stringify(next));
            }}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
              showExtraColumns ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
            }`}
          >
            More Columns
          </button>

          {/* Import Doc */}
          <button
            onClick={() => wordDocInputRef.current?.click()}
            disabled={importingDoc}
            className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {importingDoc ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="hidden sm:inline">{importProgress || 'Importing...'}</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              'Import Doc'
            )}
          </button>
          <input
            ref={wordDocInputRef}
            type="file"
            accept=".doc,.docx"
            onChange={handleWordDocUpload}
            className="hidden"
          />

          {/* Refresh */}
          <button
            onClick={loadOrders}
            className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            Refresh
          </button>
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Date From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Date To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="none">No Sorting</option>
                  <option value="date">Date</option>
                  <option value="value">Value</option>
                  <option value="consignee">Consignee Name</option>
                  <option value="packageNumber">Package Number</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Order</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  disabled={sortBy === 'none'}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="asc">{sortBy === 'date' ? 'Oldest first' : sortBy === 'value' ? 'Low to High' : 'A-Z'}</option>
                  <option value="desc">{sortBy === 'date' ? 'Newest first' : sortBy === 'value' ? 'High to Low' : 'Z-A'}</option>
                </select>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Showing {sortedOrders.length} of {orders.length} orders
                </span>
                <button
                  onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setSortBy('none'); setSortOrder('asc'); }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Progress Banner */}
      {(exporting || exportingSheets) && (
        <div className="bg-blue-900/40 border border-blue-700 rounded-lg p-3 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-300 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <p className="text-blue-100 font-medium text-sm">
              {exporting ? 'Exporting to Machote (Google Docs)' : 'Exporting customs sheet (Google Sheets)'}
            </p>
            <p className="text-blue-200/80 text-xs mt-0.5">
              {exportPhase || 'Working — this can take up to a minute on large batches.'}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-700 sticky top-0 z-10">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === sortedOrders.length && sortedOrders.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 sm:w-4 sm:h-4 cursor-pointer"
                  />
                </th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Screenshot</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Package #</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Date</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Consignee</th>
                {/* Auto-filled fields */}
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Pieces</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Tracking Number</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Value</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Company</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold">Carrier</th>
                {showExtraColumns && (
                  <>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Weight (lb)</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Customer Received</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-white text-xs sm:text-sm font-semibold whitespace-nowrap">Date Delivered</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={showExtraColumns ? 13 : 10} className="px-4 py-16">
                    {orders.length === 0 ? (
                      <div className="flex flex-col items-center text-center max-w-md mx-auto">
                        <div className="w-16 h-16 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center mb-4">
                          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-white font-semibold text-base mb-1">No orders yet</h3>
                        <p className="text-slate-400 text-sm mb-4">
                          Drop a Word doc of order screenshots into <span className="text-purple-300 font-medium">Import Doc</span>, and we'll extract every customer, package, and line item automatically.
                        </p>
                        <button
                          onClick={() => wordDocInputRef.current?.click()}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Import Doc
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center max-w-md mx-auto">
                        <h3 className="text-white font-semibold text-base mb-1">No matches</h3>
                        <p className="text-slate-400 text-sm mb-4">
                          {orders.length} order{orders.length !== 1 ? 's' : ''} in this org, but none match your current search or filters.
                        </p>
                        <button
                          onClick={() => {
                            setFilterConsignee('');
                            setFilterDateFrom('');
                            setFilterDateTo('');
                            setSortBy('none');
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Clear all filters
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    data-row-id={order.id}
                    className={`border-t border-slate-700 transition-colors ${
                      selectedRows.has(order.id) ? 'bg-blue-900/30' : 'hover:bg-slate-750'
                    }`}
                  >
                    <td
                      className="px-2 sm:px-4 py-2 select-none"
                      onMouseDown={(e) => handleDragStart(order.id, e)}
                      onMouseEnter={() => handleDragEnter(order.id)}
                      onTouchStart={(e) => handleDragStart(order.id, e)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRows.has(order.id)}
                        onChange={() => handleRowSelect(order.id)}
                        className="w-5 h-5 sm:w-4 sm:h-4 cursor-pointer pointer-events-none"
                      />
                    </td>
                    <td className="px-2 sm:px-4 py-2">
                      {order.screenshotUrls && order.screenshotUrls.length > 0 ? (
                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 cursor-pointer" onClick={() => openGallery(order.screenshotUrls, 0)}>
                          <img
                            src={order.screenshotUrls[0]}
                            alt={`Screenshot 1`}
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded border-2 border-slate-600 hover:border-blue-500 active:border-blue-400 transition-colors"
                            title={`${order.screenshotUrls.length} screenshot${order.screenshotUrls.length > 1 ? 's' : ''} - Tap to view gallery`}
                          />
                          {/* Count badge */}
                          {order.screenshotUrls.length > 1 && (
                            <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center border-2 border-slate-800">
                              {order.screenshotUrls.length}
                            </div>
                          )}
                          {/* DOC badge for word-doc imports */}
                          {(order as any).source === 'word-doc' && (
                            <div className="absolute -bottom-1 -left-1 bg-purple-600 text-white text-[9px] font-bold rounded px-1 py-0.5 border border-slate-800">
                              DOC
                            </div>
                          )}
                        </div>
                      ) : (order as any).source === 'word-doc' ? (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-purple-900/30 rounded border border-purple-600 flex flex-col items-center justify-center text-purple-400 text-xs gap-1">
                          <span className="text-lg">📄</span>
                          <span className="text-[9px] font-bold">DOC</span>
                        </div>
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-700 rounded border border-slate-600 flex items-center justify-center text-slate-500 text-xs">
                          No images
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'packageNumber')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'date')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'consignee')}</td>
                    {/* Auto-filled fields */}
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'pieces')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'merchantTrackingNumber')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'value')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'company')}</td>
                    <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'parcelComp')}</td>
                    {showExtraColumns && (
                      <>
                        <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'weight')}</td>
                        <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'customerReceivedDate')}</td>
                        <td className="px-2 sm:px-4 py-2 text-white text-xs sm:text-sm">{renderCell(order, 'dateDelivered')}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screenshot Gallery Modal */}
      {galleryOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-2 sm:p-4" onClick={closeGallery}>
          <div className="relative max-w-6xl w-full max-h-screen flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Close button - top right corner, mobile optimized */}
            <button
              onClick={closeGallery}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold shadow-lg z-20 transition-colors"
              title="Close (ESC)"
            >
              ✕
            </button>

            {/* Image counter - mobile optimized */}
            <div className="absolute top-2 left-2 sm:top-6 sm:left-6 bg-black/60 text-white px-2 py-1 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-lg font-semibold">
              {currentImageIndex + 1} / {galleryImages.length}
            </div>

            {/* Main image - mobile optimized */}
            <div className="flex-1 flex items-center justify-center mt-14 sm:mt-0">
              <img
                src={galleryImages[currentImageIndex]}
                alt={`Screenshot ${currentImageIndex + 1}`}
                className="max-w-full max-h-[70vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Navigation - mobile optimized */}
            {galleryImages.length > 1 && (
              <>
                {/* Previous button - smaller on mobile */}
                <button
                  onClick={prevImage}
                  className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-white p-2 sm:p-4 rounded-full transition-colors text-lg sm:text-2xl"
                  title="Previous (←)"
                >
                  ←
                </button>

                {/* Next button - smaller on mobile */}
                <button
                  onClick={nextImage}
                  className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-white p-2 sm:p-4 rounded-full transition-colors text-lg sm:text-2xl"
                  title="Next (→)"
                >
                  →
                </button>

                {/* Thumbnail strip - mobile optimized with smaller thumbnails */}
                <div className="mt-2 sm:mt-4 flex gap-1 sm:gap-2 overflow-x-auto pb-2 justify-start sm:justify-center px-2">
                  {galleryImages.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Thumbnail ${idx + 1}`}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`w-12 h-12 sm:w-20 sm:h-20 object-cover rounded cursor-pointer border-2 transition-all flex-shrink-0 ${
                        idx === currentImageIndex ? 'border-blue-500 scale-110' : 'border-slate-600 opacity-60 active:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating action bar when rows are selected */}
      {selectedRows.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-600 shadow-2xl px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-white font-medium text-sm">
              {selectedRows.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMachoteModal(true)}
                disabled={exporting || exportingSheets}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {exporting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : null}
                Machote
              </button>
              <button
                onClick={handleExportToSheets}
                disabled={exportingSheets || exporting}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {exportingSheets ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : null}
                Desarrollo
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={exporting || exportingSheets}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Machote Export Modal */}
      {showMachoteModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowMachoteModal(false)}>
          <div className="bg-slate-800 rounded-lg shadow-2xl max-w-lg w-full border border-slate-600" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Export to Machote</h3>
              <p className="text-slate-300 mt-2">Choose how you want to export your orders</p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Option 1: Add to Existing */}
              <label className="flex items-start gap-4 p-4 bg-slate-700/50 border-2 border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="machoteAction"
                  value="append"
                  checked={machoteAction === 'append'}
                  onChange={(e) => setMachoteAction(e.target.value as 'append' | 'fresh')}
                  className="mt-1 w-5 h-5 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📎</span>
                    <h4 className="text-white font-semibold">Add to Current Machote</h4>
                  </div>
                  <p className="text-slate-300 text-sm">
                    Append selected orders to your existing Google Doc. Orders will be added to the end of the document with a separator line.
                  </p>
                  <p className="text-blue-400 text-xs mt-2">
                    ✓ Recommended for continuous order processing
                  </p>
                </div>
              </label>

              {/* Option 2: Start Fresh */}
              <label className="flex items-start gap-4 p-4 bg-slate-700/50 border-2 border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="machoteAction"
                  value="fresh"
                  checked={machoteAction === 'fresh'}
                  onChange={(e) => setMachoteAction(e.target.value as 'append' | 'fresh')}
                  className="mt-1 w-5 h-5 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🆕</span>
                    <h4 className="text-white font-semibold">Start Fresh Machote</h4>
                  </div>
                  <p className="text-slate-300 text-sm">
                    Create a brand new Google Doc with today's date. This will start a new document from scratch.
                  </p>
                  <p className="text-yellow-400 text-xs mt-2">
                    ⚠️ Previous document will remain unchanged
                  </p>
                </div>
              </label>

              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                <p className="text-blue-300 text-sm">
                  <span className="font-semibold">Tip:</span> Orders are always sorted alphabetically by customer name (A-Z) in the Machote.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={() => setShowMachoteModal(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMachoteExport(machoteAction === 'fresh')}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {machoteAction === 'append' ? (
                  <>
                    <span>📎</span>
                    <span>Add to Machote</span>
                  </>
                ) : (
                  <>
                    <span>🆕</span>
                    <span>Start Fresh</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
