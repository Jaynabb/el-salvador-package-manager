import React, { useState, useRef } from 'react';
import { convertPdfToImages } from '../utils/pdfHelper';
import { analyzePackagePhoto } from '../services/geminiService';
import { addPackage, findCustomerByPhone, addCustomer } from '../services/firestoreClient';
import { calculateDuty, formatCurrency } from '../utils/dutyCalculator';
import { sendPackageNotification } from '../services/smsService';
import { addActivityLog } from '../services/firestoreClient';
import type { PackageItem, PackageStatus } from '../types';

interface Props {
  onPackageAdded: () => void;
}

interface ScannedPackage {
  id: string;
  imagePreview: string;
  trackingNumber: string;
  carrier: string;
  origin: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  items: PackageItem[];
  status: PackageStatus;
  notes: string;
  totalValue: number;
  totalFees: number;
  saved: boolean;
}

const ScanPackage: React.FC<Props> = ({ onPackageAdded }) => {
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setSuccess(null);
    setAnalyzing(true);

    try {
      const newPackages: ScannedPackage[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let dataUrl: string;

        if (file.type === 'application/pdf') {
          const images = await convertPdfToImages(file);
          dataUrl = images[0];
        } else {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        // Analyze with AI
        const base64Image = dataUrl.split(',')[1];
        const result = await analyzePackagePhoto(base64Image);

        const items = result.items;
        const dutyCalc = calculateDuty(items, 'personal');

        newPackages.push({
          id: `pkg_${Date.now()}_${i}`,
          imagePreview: dataUrl,
          trackingNumber: result.trackingNumber || `TRACK${Date.now()}${i}`,
          carrier: result.carrier || '',
          origin: result.origin || '',
          customerName: '',
          customerPhone: '',
          customerEmail: '',
          items,
          status: 'received',
          notes: '',
          totalValue: dutyCalc.declaredValue,
          totalFees: dutyCalc.totalFees,
          saved: false
        });
      }

      setScannedPackages([...scannedPackages, ...newPackages]);
      setSuccess(`Scanned ${newPackages.length} package${newPackages.length > 1 ? 's' : ''}!`);
    } catch (err: any) {
      setError(err.message || 'Failed to scan packages');
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const updatePackage = (id: string, updates: Partial<ScannedPackage>) => {
    setScannedPackages(scannedPackages.map(pkg =>
      pkg.id === id ? { ...pkg, ...updates } : pkg
    ));
  };

  const removePackage = (id: string) => {
    setScannedPackages(scannedPackages.filter(pkg => pkg.id !== id));
  };

  const handleSavePackage = async (pkg: ScannedPackage) => {
    if (!pkg.trackingNumber || !pkg.customerName || !pkg.customerPhone || pkg.items.length === 0) {
      setError(`Package ${pkg.trackingNumber}: Please fill in tracking number, customer info, and items`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Find or create customer
      let customer = await findCustomerByPhone(pkg.customerPhone);
      if (!customer) {
        const customerId = await addCustomer({
          name: pkg.customerName,
          phone: pkg.customerPhone,
          email: pkg.customerEmail || undefined,
        });
        customer = { id: customerId, name: pkg.customerName, phone: pkg.customerPhone, email: pkg.customerEmail, createdAt: new Date() };
      }

      // Calculate duties
      const dutyCalc = calculateDuty(pkg.items, 'personal');

      // Create package
      const packageData = {
        trackingNumber: pkg.trackingNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        items: pkg.items,
        totalValue: dutyCalc.declaredValue,
        totalWeight: pkg.items.reduce((sum, item) => sum + (item.weight || 0), 0),
        origin: pkg.origin,
        carrier: pkg.carrier,
        customsDeclaration: {
          declaredValue: dutyCalc.declaredValue,
          currency: 'USD',
          purpose: 'personal' as const,
          estimatedDuty: dutyCalc.importDuty,
          estimatedVAT: dutyCalc.vat
        },
        status: pkg.status,
        receivedDate: new Date(),
        customsDuty: dutyCalc.importDuty,
        vat: dutyCalc.vat,
        totalFees: dutyCalc.totalFees,
        paymentStatus: 'pending' as const,
        notes: pkg.notes
      };

      const packageId = await addPackage(packageData);

      // Log activity
      await addActivityLog({
        packageId,
        action: 'Package received',
        details: { trackingNumber: pkg.trackingNumber, customerName: pkg.customerName }
      });

      // Send SMS notification
      await sendPackageNotification(
        { id: packageId, ...packageData, createdAt: new Date(), updatedAt: new Date() },
        'package_received'
      );

      updatePackage(pkg.id, { saved: true });
      setSuccess(`Package ${pkg.trackingNumber} saved!`);
      onPackageAdded();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    const unsavedPackages = scannedPackages.filter(pkg => !pkg.saved);

    for (const pkg of unsavedPackages) {
      await handleSavePackage(pkg);
    }
  };

  const handleClearSaved = () => {
    setScannedPackages(scannedPackages.filter(pkg => !pkg.saved));
    setSuccess('Cleared saved packages!');
    setTimeout(() => setSuccess(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-white">Scan Packages</h2>
            <p className="text-slate-400 mt-1">
              Scan multiple shipping labels at once - AI will extract all package details
            </p>
          </div>
          {scannedPackages.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={handleClearSaved}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Clear Saved
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving || scannedPackages.every(p => p.saved)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
              >
                💾 Save All ({scannedPackages.filter(p => !p.saved).length})
              </button>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-blue-500 transition-colors mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
            id="package-upload"
            multiple
          />
          <label htmlFor="package-upload" className="cursor-pointer">
            <div className="text-6xl mb-4">📸</div>
            <div className="text-white font-medium mb-2">
              {analyzing ? 'Analyzing packages...' : 'Take Photos or Upload Multiple Files'}
            </div>
            <div className="text-slate-400 text-sm">
              Select multiple images or PDFs at once for batch scanning
            </div>
          </label>
        </div>

        {/* Analyzing State */}
        {analyzing && (
          <div className="text-center py-8 mb-6">
            <div className="text-6xl mb-4 animate-pulse">🔍</div>
            <div className="text-white text-xl font-medium mb-2">Analyzing Packages...</div>
            <div className="text-slate-400">Extracting data with AI - this may take a moment</div>
          </div>
        )}

        {/* Scanned Packages List */}
        {scannedPackages.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">
                Scanned Packages ({scannedPackages.length}) -
                <span className="text-green-400 ml-2">{scannedPackages.filter(p => p.saved).length} Saved</span>
              </h3>
            </div>

            {scannedPackages.map((pkg) => (
              <div
                key={pkg.id}
                className={`bg-slate-700/30 rounded-lg p-6 border transition-all ${
                  pkg.saved
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Image Preview */}
                  <div>
                    <img
                      src={pkg.imagePreview}
                      alt={`Package ${pkg.trackingNumber}`}
                      className="w-full rounded-lg border border-slate-600"
                    />
                    {pkg.saved && (
                      <div className="mt-2 bg-green-500/20 border border-green-500/50 rounded px-3 py-2 text-center">
                        <span className="text-green-400 font-medium text-sm">✓ Saved</span>
                      </div>
                    )}
                  </div>

                  {/* Package Details */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-semibold text-white">
                            {pkg.trackingNumber}
                          </h4>
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/50">
                            {pkg.items.length} items
                          </span>
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-slate-400">
                          <span>💰 {formatCurrency(pkg.totalValue)}</span>
                          <span>📊 Fees: {formatCurrency(pkg.totalFees)}</span>
                        </div>
                      </div>
                      {!pkg.saved && (
                        <button
                          onClick={() => removePackage(pkg.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Form Fields */}
                    {!pkg.saved && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={pkg.trackingNumber}
                            onChange={(e) => updatePackage(pkg.id, { trackingNumber: e.target.value })}
                            placeholder="Tracking Number *"
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          />
                          <input
                            type="text"
                            value={pkg.carrier}
                            onChange={(e) => updatePackage(pkg.id, { carrier: e.target.value })}
                            placeholder="Carrier"
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          />
                          <input
                            type="text"
                            value={pkg.origin}
                            onChange={(e) => updatePackage(pkg.id, { origin: e.target.value })}
                            placeholder="Origin Country"
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          />
                          <select
                            value={pkg.status}
                            onChange={(e) => updatePackage(pkg.id, { status: e.target.value as PackageStatus })}
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          >
                            <option value="received">Received</option>
                            <option value="customs-pending">Customs Pending</option>
                            <option value="customs-cleared">Customs Cleared</option>
                            <option value="ready-pickup">Ready for Pickup</option>
                            <option value="on-hold">On Hold</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={pkg.customerName}
                            onChange={(e) => updatePackage(pkg.id, { customerName: e.target.value })}
                            placeholder="Customer Name *"
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          />
                          <input
                            type="tel"
                            value={pkg.customerPhone}
                            onChange={(e) => updatePackage(pkg.id, { customerPhone: e.target.value })}
                            placeholder="Phone *"
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          />
                          <input
                            type="email"
                            value={pkg.customerEmail}
                            onChange={(e) => updatePackage(pkg.id, { customerEmail: e.target.value })}
                            placeholder="Email"
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          />
                        </div>

                        <textarea
                          value={pkg.notes}
                          onChange={(e) => updatePackage(pkg.id, { notes: e.target.value })}
                          placeholder="Notes..."
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                          rows={2}
                        />
                      </>
                    )}

                    {/* Items */}
                    <div>
                      <h5 className="text-sm font-medium text-slate-300 mb-2">Package Items:</h5>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {pkg.items.map((item, idx) => (
                          <div key={idx} className="bg-slate-800/50 rounded px-3 py-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-white">{item.name}</span>
                              <div className="flex gap-3 text-xs">
                                <span className="text-blue-400">Qty: {item.quantity}</span>
                                <span className="text-green-400">${item.totalValue}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    {!pkg.saved && (
                      <button
                        onClick={() => handleSavePackage(pkg)}
                        disabled={saving}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                      >
                        {saving ? '💾 Saving...' : '💾 Save & Notify Customer'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <div className="text-red-400">⚠️ {error}</div>
          </div>
        )}

        {success && (
          <div className="mt-4 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
            <div className="text-green-400">✓ {success}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanPackage;
