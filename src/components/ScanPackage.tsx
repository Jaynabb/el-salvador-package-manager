import React, { useState, useRef } from 'react';
import { convertPdfToImages } from '../utils/pdfHelper';
import { analyzePackagePhoto } from '../services/geminiService';
import { addPackage, findCustomerByPhone, addCustomer } from '../services/firestoreClient';
import { calculateDuty } from '../utils/dutyCalculator';
import { sendPackageNotification } from '../services/smsService';
import { addActivityLog } from '../services/firestoreClient';
import type { PackageItem, PackageStatus } from '../types';

interface Props {
  onPackageAdded: () => void;
}

const ScanPackage: React.FC<Props> = ({ onPackageAdded }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extracted data
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [origin, setOrigin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [items, setItems] = useState<PackageItem[]>([]);
  const [status, setStatus] = useState<PackageStatus>('received');
  const [notes, setNotes] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(false);

    try {
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

      setImagePreview(dataUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to load file');
    }
  };

  const handleAnalyze = async () => {
    if (!imagePreview) return;

    setAnalyzing(true);
    setError(null);

    try {
      const base64Image = imagePreview.split(',')[1];
      const result = await analyzePackagePhoto(base64Image);

      setTrackingNumber(result.trackingNumber || '');
      setCarrier(result.carrier || '');
      setOrigin(result.origin || '');
      setItems(result.items);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze image');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSavePackage = async () => {
    if (!trackingNumber || !customerName || !customerPhone || items.length === 0) {
      setError('Please fill in tracking number, customer info, and at least one item');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Find or create customer
      let customer = await findCustomerByPhone(customerPhone);
      if (!customer) {
        const customerId = await addCustomer({
          name: customerName,
          phone: customerPhone,
          email: customerEmail || undefined,
        });
        customer = { id: customerId, name: customerName, phone: customerPhone, email: customerEmail, createdAt: new Date() };
      }

      // Calculate duties
      const dutyCalc = calculateDuty(items, 'personal');

      // Create package
      const packageData = {
        trackingNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        items,
        totalValue: dutyCalc.declaredValue,
        totalWeight: items.reduce((sum, item) => sum + (item.weight || 0), 0),
        origin,
        carrier,
        customsDeclaration: {
          declaredValue: dutyCalc.declaredValue,
          currency: 'USD',
          purpose: 'personal' as const,
          estimatedDuty: dutyCalc.importDuty,
          estimatedVAT: dutyCalc.vat
        },
        status,
        receivedDate: new Date(),
        customsDuty: dutyCalc.importDuty,
        vat: dutyCalc.vat,
        totalFees: dutyCalc.totalFees,
        paymentStatus: 'pending' as const,
        notes
      };

      const packageId = await addPackage(packageData);

      // Log activity
      await addActivityLog({
        packageId,
        action: 'Package received',
        details: { trackingNumber, customerName }
      });

      // Send SMS notification
      await sendPackageNotification(
        { id: packageId, ...packageData, createdAt: new Date(), updatedAt: new Date() },
        'package_received'
      );

      setSuccess(true);
      handleNewScan();
      onPackageAdded();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const handleNewScan = () => {
    setImagePreview(null);
    setTrackingNumber('');
    setCarrier('');
    setOrigin('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setItems([]);
    setNotes('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700">
        <h2 className="text-3xl font-bold text-white mb-2">Scan Package</h2>
        <p className="text-slate-400 mb-6">
          Take a photo of the shipping label or invoice to automatically extract package information.
        </p>

        {/* Upload Section */}
        {!imagePreview && (
          <div className="border-2 border-dashed border-slate-600 rounded-xl p-12 text-center hover:border-blue-500 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              id="package-upload"
            />
            <label htmlFor="package-upload" className="cursor-pointer">
              <div className="text-6xl mb-4">📸</div>
              <div className="text-white font-medium mb-2">Take Photo or Upload File</div>
              <div className="text-slate-400 text-sm">Supports images (JPG, PNG) and PDF files</div>
            </label>
          </div>
        )}

        {/* Image Preview & Analysis */}
        {imagePreview && !analyzing && items.length === 0 && (
          <div className="space-y-4">
            <img
              src={imagePreview}
              alt="Package preview"
              className="w-full rounded-lg border-2 border-slate-700"
            />
            <div className="flex gap-4">
              <button
                onClick={handleAnalyze}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                🔍 Analyze with AI
              </button>
              <button
                onClick={handleNewScan}
                className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Analyzing State */}
        {analyzing && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4 animate-pulse">🔍</div>
            <div className="text-white text-xl font-medium mb-2">Analyzing Package...</div>
            <div className="text-slate-400">Extracting tracking number, items, and customs info</div>
          </div>
        )}

        {/* Package Form */}
        {items.length > 0 && (
          <div className="space-y-6">
            <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
              <div className="text-green-400 font-medium">
                ✓ Analysis complete! Review and edit details below
              </div>
            </div>

            {/* Package Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Tracking Number *
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="ABC123456789"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Carrier
                </label>
                <input
                  type="text"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="DHL, FedEx, USPS, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Origin Country
                </label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="United States, China, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PackageStatus)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="received">Received</option>
                  <option value="customs-pending">Customs Pending</option>
                  <option value="customs-cleared">Customs Cleared</option>
                  <option value="ready-pickup">Ready for Pickup</option>
                  <option value="on-hold">On Hold</option>
                </select>
              </div>
            </div>

            {/* Customer Info */}
            <div className="border-t border-slate-700 pt-6">
              <h3 className="text-lg font-semibold text-white mb-4">Customer Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="+503 1234-5678"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="customer@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="border-t border-slate-700 pt-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Package Items ({items.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="bg-slate-700/50 rounded-lg p-4 border border-slate-600"
                  >
                    <div className="font-medium text-white">{item.name}</div>
                    {item.description && (
                      <div className="text-sm text-slate-400 mt-1">{item.description}</div>
                    )}
                    <div className="flex gap-4 mt-2 text-sm">
                      <span className="text-blue-400">Qty: {item.quantity}</span>
                      <span className="text-green-400">${item.unitValue} each</span>
                      <span className="text-yellow-400">Total: ${item.totalValue}</span>
                      {item.hsCode && (
                        <span className="text-purple-400">HS: {item.hsCode}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                rows={3}
                placeholder="Any additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleSavePackage}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                {saving ? '💾 Saving...' : '💾 Save Package & Notify Customer'}
              </button>
              <button
                onClick={handleNewScan}
                className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                New Scan
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <div className="text-red-400">⚠️ {error}</div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mt-4 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
            <div className="text-green-400">✓ Package saved and customer notified!</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanPackage;
