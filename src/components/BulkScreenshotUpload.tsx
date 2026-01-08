import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { analyzeOrderScreenshot } from '../services/geminiService';
import { loadGoogleAPIs, openDrivePicker } from '../services/googleDrivePicker';
import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db, storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { OrderRow } from './OrderManagement';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  customerName?: string; // Assigned customer name
  extractedData?: any; // Cache AI extraction results
  extractionProgress?: number; // Progress percentage (0-100)
  status: 'pending' | 'extracting' | 'processing' | 'completed' | 'error';
  error?: string;
}

export default function BulkScreenshotUpload() {
  const { currentUser } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [googleApiLoaded, setGoogleApiLoaded] = useState(false);
  const [recentCustomerNames, setRecentCustomerNames] = useState<string[]>([]);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleAPIs()
      .then(() => setGoogleApiLoaded(true))
      .catch(err => console.error('Failed to load Google APIs:', err));
  }, []);

  // Load and cleanup customer names from localStorage (3-day retention)
  useEffect(() => {
    const STORAGE_KEY = 'importflow_customer_names';
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{ name: string; timestamp: number }>;
        const now = Date.now();

        // Filter out names older than 3 days
        const validNames = parsed.filter(item => now - item.timestamp < THREE_DAYS_MS);

        // Save cleaned list back to localStorage
        if (validNames.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(validNames));
        }

        // Extract just the names for display
        const names = validNames.map(item => item.name);
        setRecentCustomerNames(names);
      }
    } catch (error) {
      console.error('Error loading customer names from localStorage:', error);
    }
  }, []);

  // Helper function to save customer name to localStorage with timestamp
  const saveCustomerNameToStorage = (name: string) => {
    const STORAGE_KEY = 'importflow_customer_names';
    const trimmedName = name.trim();

    if (!trimmedName || trimmedName.length < 2) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let names: Array<{ name: string; timestamp: number }> = stored ? JSON.parse(stored) : [];

      // Check if name already exists
      const existingIndex = names.findIndex(item => item.name === trimmedName);

      if (existingIndex >= 0) {
        // Update timestamp for existing name
        names[existingIndex].timestamp = Date.now();
      } else {
        // Add new name
        names.unshift({ name: trimmedName, timestamp: Date.now() });
      }

      // Keep only most recent 50 names to avoid localStorage bloat
      names = names.slice(0, 50);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
    } catch (error) {
      console.error('Error saving customer name to localStorage:', error);
    }
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList) return;

    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const preview = await fileToDataURL(file);

      const newFile: UploadedFile = {
        id: `file-${Date.now()}-${i}`,
        file,
        preview,
        status: 'extracting', // Start with extracting status
        extractionProgress: 0
      };

      newFiles.push(newFile);
    }

    setFiles(prev => [...prev, ...newFiles]);

    // Auto-extract customer names from screenshots
    extractCustomerNames(newFiles);
  };

  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getNextPackageNumber = async (): Promise<number> => {
    if (!currentUser?.organizationId) {
      console.warn('No organization ID available, starting from 1');
      return 1;
    }

    try {
      const ordersRef = collection(db, 'organizations', currentUser.organizationId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      if (snapshot.empty) return 1;

      const lastOrder = snapshot.docs[0].data() as OrderRow;
      const lastNumber = parseInt(lastOrder.packageNumber.replace(/\D/g, '')) || 0;
      return lastNumber + 1;
    } catch (error) {
      console.error('Error getting next package number:', error);
      return 1;
    }
  };

  /**
   * Upload screenshot to Firebase Storage and return download URL
   */
  const uploadScreenshot = async (file: File, organizationId: string, packageNumber: number): Promise<string> => {
    if (!storage) {
      throw new Error('Firebase Storage not initialized');
    }

    // Create unique filename with timestamp
    const timestamp = Date.now();
    const fileName = `screenshots/org_${organizationId}/package_${packageNumber}_${timestamp}.jpg`;

    // Create storage reference
    const storageRef = ref(storage, fileName);

    // Upload file
    await uploadBytes(storageRef, file);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  };

  const handleAssignNameToFile = (fileId: string, name: string) => {
    const trimmedName = name.trim();

    setFiles(prev => prev.map(f =>
      f.id === fileId ? {
        ...f,
        customerName: name,
        error: undefined // Clear any extraction errors when user manually enters a name
      } : f
    ));

    // Add to recent names immediately if it's a valid name (not empty and not already in list)
    if (trimmedName && trimmedName.length >= 2 && !recentCustomerNames.includes(trimmedName)) {
      setRecentCustomerNames(prev => [trimmedName, ...prev].slice(0, 10));
      saveCustomerNameToStorage(trimmedName); // Save to localStorage with timestamp
    }
  };

  const handleNameInputBlur = (fileId: string, name: string) => {
    const trimmedName = name.trim();
    if (trimmedName && !recentCustomerNames.includes(trimmedName)) {
      setRecentCustomerNames(prev => [trimmedName, ...prev].slice(0, 10));
      saveCustomerNameToStorage(trimmedName); // Save to localStorage with timestamp
    }
  };

  const handleRemoveRecentName = (nameToRemove: string) => {
    setRecentCustomerNames(prev => prev.filter(n => n !== nameToRemove));
  };

  const handleSelectRecentName = (fileId: string, name: string) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, customerName: name } : f
    ));
    setFocusedInput(null); // Close dropdown
  };

  /**
   * Extract customer names from uploaded screenshots using AI
   * Runs immediately on upload to auto-fill names
   */
  const extractCustomerNames = async (filesToExtract: UploadedFile[]) => {
    for (const file of filesToExtract) {
      try {
        // Update progress
        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, extractionProgress: 25 } : f
        ));

        // Extract base64 from data URL
        const parts = file.preview.split(',');
        if (parts.length < 2) {
          throw new Error('Invalid image format');
        }
        const base64 = parts[1];

        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, extractionProgress: 50 } : f
        ));

        // AI extraction
        const extractedData = await analyzeOrderScreenshot(base64);

        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, extractionProgress: 75 } : f
        ));

        // Auto-fill customer name if found
        const customerName = extractedData.customerName || '';

        // Add to recent names if found
        if (customerName && !recentCustomerNames.includes(customerName)) {
          setRecentCustomerNames(prev => [customerName, ...prev].slice(0, 10));
          saveCustomerNameToStorage(customerName); // Save to localStorage with timestamp
        }

        setFiles(prev => prev.map(f =>
          f.id === file.id ? {
            ...f,
            customerName: customerName, // Auto-fill customer name
            extractedData: extractedData, // Cache for later use
            extractionProgress: 100,
            status: 'pending' as const
          } : f
        ));

        // Clear progress after a moment
        setTimeout(() => {
          setFiles(prev => prev.map(f =>
            f.id === file.id ? { ...f, extractionProgress: undefined } : f
          ));
        }, 1000);

      } catch (error) {
        console.error('Error extracting customer name:', error);
        // Set to pending even if extraction fails - user can manually enter
        setFiles(prev => prev.map(f =>
          f.id === file.id ? {
            ...f,
            status: 'pending' as const,
            extractionProgress: undefined,
            error: 'Name extraction failed - please enter manually'
          } : f
        ));
      }
    }
  };

  const processFiles = async () => {
    if (!currentUser?.organizationId) {
      alert('❌ Organization not configured. Please contact support.');
      return;
    }

    const filesToProcess = files.filter(f => f.status === 'pending');
    if (filesToProcess.length === 0) return;

    // Check if all files have customer names assigned
    const filesWithoutNames = filesToProcess.filter(f => !f.customerName);
    if (filesWithoutNames.length > 0) {
      alert(`⚠️ Please assign customer names to all screenshots before processing.\n\n${filesWithoutNames.length} screenshot(s) missing names.`);
      return;
    }

    setProcessing(true);

    try {
      // Group files by customer name
      const filesByCustomer = new Map<string, UploadedFile[]>();
      for (const file of filesToProcess) {
        const customerName = file.customerName || '';
        if (!filesByCustomer.has(customerName)) {
          filesByCustomer.set(customerName, []);
        }
        filesByCustomer.get(customerName)!.push(file);
      }

      let packageNumber = await getNextPackageNumber();
      let successCount = 0;

      // Process each customer (one order per customer)
      for (const [customerName, customerFiles] of filesByCustomer) {
        try {
          // Mark all files for this customer as processing
          setFiles(prev => prev.map(f =>
            customerFiles.some(cf => cf.id === f.id) ? { ...f, status: 'processing' as const } : f
          ));

          // Process all screenshots for this customer
          const screenshotUrls: string[] = [];
          let totalPieces = 0;
          let totalValue = 0;
          let parcelComp = '';
          let company = '';
          let weight = '';
          const carriersSet = new Set<string>(); // Collect all unique carriers
          const trackingNumbersSet = new Set<string>(); // Collect all unique tracking numbers
          const orderNumbersSet = new Set<string>(); // Collect all unique order numbers

          for (const file of customerFiles) {
            // Use cached extraction data if available, otherwise extract now
            let extractedData = file.extractedData;

            if (!extractedData) {
              // Extract base64 from data URL
              const parts = file.preview.split(',');
              if (parts.length < 2) {
                throw new Error('Invalid image format');
              }
              const base64 = parts[1];

              // AI extraction (fallback if not cached)
              extractedData = await analyzeOrderScreenshot(base64);
            }

            // Upload screenshot to Firebase Storage
            const screenshotUrl = await uploadScreenshot(file.file, currentUser.organizationId, packageNumber);
            screenshotUrls.push(screenshotUrl);

            // Accumulate data from all screenshots
            totalPieces += extractedData.totalPieces || 0;
            totalValue += extractedData.orderTotal || 0;

            // Collect ALL tracking numbers from all screenshots
            // AI may return multiple tracking numbers comma-separated, so split them
            if (extractedData.trackingNumber && extractedData.trackingNumber.trim()) {
              const trackingNums = extractedData.trackingNumber.split(',');
              trackingNums.forEach(num => {
                const trimmed = num.trim();
                if (trimmed) {
                  trackingNumbersSet.add(trimmed);
                }
              });
            }

            // Collect ALL order numbers from all screenshots
            if (extractedData.orderNumber && extractedData.orderNumber.trim()) {
              orderNumbersSet.add(extractedData.orderNumber.trim());
            }

            if (!company && (extractedData.company || extractedData.seller)) {
              company = extractedData.company || extractedData.seller || '';
            }
            if (!weight && extractedData.weight) {
              weight = String(extractedData.weight);
            }
            // Collect carriers from all screenshots
            if (extractedData.carriers && Array.isArray(extractedData.carriers)) {
              extractedData.carriers.forEach(carrier => {
                if (carrier && carrier.trim()) {
                  carriersSet.add(carrier.trim());
                }
              });
            }
          }

          // Combine all tracking numbers with comma separation
          const allTrackingNumbers = Array.from(trackingNumbersSet).join(', ');
          // Combine all order numbers with comma separation (for fallback)
          const allOrderNumbers = Array.from(orderNumbersSet).join(', ');
          // If no tracking numbers, use all order numbers as fallback
          const finalTrackingNumber = allTrackingNumbers || allOrderNumbers || '';

          // Use AI-extracted carriers for parcelComp field
          // If multiple carriers found, join them with comma
          if (carriersSet.size > 0) {
            parcelComp = Array.from(carriersSet).join(', ');
          } else if (finalTrackingNumber) {
            // Fallback: Detect parcel company from tracking number format if no carriers extracted
            if (finalTrackingNumber.startsWith('1Z')) {
              parcelComp = 'UPS';
            } else if (finalTrackingNumber.length === 12 && /^\d+$/.test(finalTrackingNumber)) {
              parcelComp = 'FedEx';
            } else if (finalTrackingNumber.length >= 20) {
              parcelComp = 'USPS';
            } else {
              parcelComp = 'USPS';
            }
          }

          // Get current date in local timezone (not UTC) to avoid off-by-one day issues
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const localDate = `${year}-${month}-${day}`;

          // Create ONE order for this customer with ALL their screenshots
          const orderData: any = {
            packageNumber: `Paquete #${packageNumber}`,
            date: localDate, // Use local date instead of ISO string to avoid timezone issues
            consignee: customerName,
            pieces: totalPieces,
            weight: weight,
            trackingNumber: '', // Leave empty for manual input
            company: company,
            value: totalValue,
            parcelComp: parcelComp,
            screenshotUrls: screenshotUrls, // Array of ALL screenshot URLs for this customer
            createdAt: new Date()
          };

          // Only add optional fields if they have values (Firestore doesn't accept undefined)
          // Fill merchantTrackingNumber with ALL tracking numbers (comma-separated)
          if (finalTrackingNumber) {
            orderData.merchantTrackingNumber = finalTrackingNumber;
          }
          if (allOrderNumbers) {
            orderData.orderNumber = allOrderNumbers;
          }
          // Add carriers array if any were extracted
          if (carriersSet.size > 0) {
            orderData.carriers = Array.from(carriersSet);
          }

          // Save to Firestore
          const ordersRef = collection(db, 'organizations', currentUser.organizationId, 'orders');
          await addDoc(ordersRef, orderData);

          packageNumber++;
          successCount++;

          // Mark all files for this customer as completed
          setFiles(prev => prev.map(f =>
            customerFiles.some(cf => cf.id === f.id) ? { ...f, status: 'completed' as const } : f
          ));
        } catch (error) {
          console.error('Error processing customer files:', error);

          // Mark all files for this customer as error
          setFiles(prev => prev.map(f =>
            customerFiles.some(cf => cf.id === f.id) ? {
              ...f,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Processing failed'
            } : f
          ));
        }
      }

      const totalScreenshots = filesToProcess.length;
      alert(`✅ Successfully processed ${totalScreenshots} screenshot${totalScreenshots !== 1 ? 's' : ''} into ${successCount} order${successCount !== 1 ? 's' : ''}!\n\nData added to Order Management table.\n\nGo to Order Management to view and edit.`);

      // Clear completed files after a delay
      setTimeout(() => {
        setFiles(prev => prev.filter(f => f.status === 'error'));
      }, 2000);

    } catch (error) {
      console.error('Error processing files:', error);
      alert('❌ Failed to process some screenshots');
    } finally {
      setProcessing(false);
    }
  };

  const removePhoto = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleClearAll = () => {
    setFiles([]);
  };

  const handleRetryErrors = () => {
    setFiles(prev => prev.map(f =>
      f.status === 'error' ? { ...f, status: 'pending' as const, error: undefined } : f
    ));
  };

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'extracting': return 'border-purple-500 bg-purple-900/20';
      case 'pending': return 'border-yellow-500 bg-yellow-900/20';
      case 'processing': return 'border-blue-500 bg-blue-900/20';
      case 'completed': return 'border-green-500 bg-green-900/20';
      case 'error': return 'border-red-500 bg-red-900/20';
    }
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'extracting': return '🔍';
      case 'pending': return '⏳';
      case 'processing': return '⚙️';
      case 'completed': return '✅';
      case 'error': return '❌';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <h1 className="text-2xl font-bold text-white mb-2">📤 Upload Screenshots</h1>
        <p className="text-slate-400">
          Upload order screenshots - AI will automatically extract data and populate Order Management
        </p>
      </div>

      {/* Instructions - concise and at the top */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
        <p className="text-xs sm:text-sm text-slate-300">
          <span className="text-blue-400 font-semibold">Quick Guide:</span> Upload screenshots → Assign names → Click "Process All" → View in Order Management
        </p>
      </div>

      {/* Upload Section */}
      {!processing && files.length === 0 && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Upload Screenshots</h2>

          {/* Local Upload */}
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors bg-slate-750">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
              id="bulk-file-upload"
            />
            <label htmlFor="bulk-file-upload" className="cursor-pointer">
              <div className="text-6xl mb-4">📁</div>
              <div className="text-lg text-slate-300 font-semibold mb-2">Upload from Computer</div>
              <div className="text-sm text-slate-400">Click to select multiple files</div>
            </label>
          </div>
        </div>
      )}

      {/* Customer Name Assignment */}
      {files.length > 0 && (
        <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Assign Customer Names</h2>
              <p className="text-sm text-slate-400 mt-1">
                {files.filter(f => f.status === 'extracting').length > 0 && `${files.filter(f => f.status === 'extracting').length} extracting • `}
                {files.filter(f => f.customerName).length} of {files.filter(f => f.status === 'pending').length} named • {files.filter(f => f.status === 'completed').length} processed
              </p>
            </div>
            <div className="flex gap-2">
              {files.some(f => f.status === 'error') && (
                <button
                  onClick={handleRetryErrors}
                  disabled={processing}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  🔄 Retry Errors
                </button>
              )}
              <button
                onClick={handleClearAll}
                disabled={processing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                ✕ Clear All
              </button>
              <button
                onClick={processFiles}
                disabled={processing || files.filter(f => f.status === 'pending' && !f.customerName).length > 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={files.filter(f => f.status === 'pending' && !f.customerName).length > 0 ? 'Assign customer names to all screenshots first' : 'Process screenshots'}
              >
                ✅ Process All
              </button>
            </div>
          </div>


          {/* File Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Add More Button */}
            <div className="rounded-lg p-3 border-2 border-dashed border-slate-600 bg-slate-750 hover:border-blue-500 hover:bg-slate-700 transition-colors">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="add-more-upload"
              />
              <label
                htmlFor="add-more-upload"
                className="cursor-pointer flex flex-col items-center justify-center h-full min-h-[180px]"
              >
                <div className="text-6xl text-slate-500 mb-2">+</div>
                <div className="text-sm text-slate-400 font-semibold text-center">Add More Screenshots</div>
                <div className="text-xs text-slate-500 mt-1 text-center">Click to upload</div>
              </label>
            </div>

            {/* Uploaded Files */}
            {files.map((file) => (
              <div
                key={file.id}
                className={`rounded-lg p-3 border-2 ${getStatusColor(file.status)}`}
              >
                <div className="relative">
                  <img
                    src={file.preview}
                    alt="Preview"
                    className="w-full h-32 object-cover rounded mb-2"
                  />

                  {/* Delete button - only show if not completed or processing */}
                  {file.status !== 'completed' && file.status !== 'processing' && (
                    <button
                      onClick={() => removePhoto(file.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-sm font-bold transition-colors shadow-lg"
                      title="Remove photo"
                    >
                      ✕
                    </button>
                  )}

                  {/* Progress indicator overlay */}
                  {file.extractionProgress !== undefined && (
                    <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-white text-2xl font-bold mb-1">
                          {file.extractionProgress}%
                        </div>
                        <div className="text-white text-xs">
                          Extracting...
                        </div>
                        {/* Progress bar */}
                        <div className="w-24 h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${file.extractionProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer name input for pending files */}
                {file.status === 'pending' ? (
                  <div className="mt-2 relative">
                    <input
                      type="text"
                      value={file.customerName || ''}
                      onChange={(e) => handleAssignNameToFile(file.id, e.target.value)}
                      onFocus={() => setFocusedInput(file.id)}
                      onBlur={(e) => {
                        // Delay to allow clicking dropdown items
                        setTimeout(() => {
                          if (focusedInput === file.id) {
                            handleNameInputBlur(file.id, e.target.value);
                            setFocusedInput(null);
                          }
                        }, 200);
                      }}
                      onKeyDown={(e) => {
                        // Stop propagation to prevent any parent elements from handling keyboard events
                        e.stopPropagation();

                        if (e.key === 'Enter') {
                          handleNameInputBlur(file.id, e.currentTarget.value);
                          setFocusedInput(null);
                        }
                        // Allow all other keys including space to work normally
                      }}
                      placeholder="Customer name..."
                      className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />

                    {/* Recent names dropdown - always show when focused */}
                    {focusedInput === file.id && (
                      <div className="absolute z-10 w-full mt-1 bg-slate-700 border border-slate-600 rounded shadow-lg max-h-40 overflow-y-auto">
                        {recentCustomerNames.length > 0 ? (
                          recentCustomerNames
                            .filter(name => !file.customerName || name.toLowerCase().includes(file.customerName.toLowerCase()))
                            .map((name, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-600 cursor-pointer group"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSelectRecentName(file.id, name)}
                                  className="flex-1 text-left text-xs text-slate-300"
                                >
                                  {name}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveRecentName(name);
                                  }}
                                  className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </div>
                            ))
                        ) : (
                          <div className="px-2 py-2 text-xs text-slate-400 text-center">
                            No recent names yet - start typing
                          </div>
                        )}
                      </div>
                    )}

                    {file.customerName && (
                      <div className="text-xs text-green-400 mt-1 text-center">✓ {file.customerName}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-2xl mb-1">{getStatusIcon(file.status)}</div>
                    <div className="text-xs text-slate-300 capitalize">{file.status}</div>
                    {file.customerName && (
                      <div className="text-xs text-slate-400 mt-1">{file.customerName}</div>
                    )}
                    {file.error && (
                      <div className="text-xs text-red-400 mt-1">{file.error}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
