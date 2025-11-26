// Customer Information
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  createdAt: Date;
}

// Package Item (contents of the package)
export interface PackageItem {
  name: string;
  description?: string;
  quantity: number;
  unitValue: number; // Value per unit in USD
  totalValue: number; // quantity * unitValue
  hsCode?: string; // Harmonized System Code (8-10 digits)
  weight?: number; // in kg
  category?: string;
}

// Package Status
export type PackageStatus =
  | 'received' // Package received at warehouse
  | 'customs-pending' // Awaiting customs clearance
  | 'customs-cleared' // Cleared by customs
  | 'ready-pickup' // Ready for customer pickup
  | 'delivered' // Delivered to customer
  | 'on-hold'; // On hold for issues

// Main Package
export interface Package {
  id: string;
  trackingNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;

  // Package Details
  items: PackageItem[];
  totalValue: number; // Sum of all item values
  totalWeight?: number; // Total weight in kg
  origin: string; // e.g., "United States", "China"
  carrier?: string; // e.g., "DHL", "FedEx", "USPS"

  // Customs Information
  customsDeclaration: CustomsDeclaration;

  // Status & Tracking
  status: PackageStatus;
  receivedDate: Date;
  customsClearedDate?: Date;
  deliveredDate?: Date;

  // Financial
  customsDuty: number; // Import duties in USD
  vat: number; // 13% VAT in USD
  handlingFee?: number; // Service fee
  totalFees: number; // customsDuty + vat + handlingFee
  paymentStatus: 'pending' | 'paid';

  // Notes & Documents
  notes?: string;
  photoUrls?: string[];
  documentUrls?: string[];

  createdAt: Date;
  updatedAt: Date;
}

// Customs Declaration
export interface CustomsDeclaration {
  declarationNumber?: string;
  declaredValue: number; // Total declared value in USD
  currency: string; // Usually "USD"
  purpose: 'personal' | 'commercial' | 'gift' | 'sample';
  invoiceNumber?: string;
  certificateOfOrigin?: boolean;
  specialPermitsRequired?: boolean;
  permitsObtained?: boolean;
  estimatedDuty: number;
  estimatedVAT: number;
}

// SMS Notification
export interface SMSNotification {
  id: string;
  packageId: string;
  customerPhone: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
  createdAt: Date;
}

// Activity Log
export interface ActivityLog {
  id: string;
  packageId: string;
  action: string; // e.g., "Package received", "Status changed to customs-cleared"
  performedBy?: string; // User who performed the action
  timestamp: Date;
  details?: Record<string, any>;
}

// Dashboard Statistics
export interface DashboardStats {
  totalPackages: number;
  packagesReceived: number;
  packagesInCustoms: number;
  packagesReadyForPickup: number;
  packagesDelivered: number;
  packagesOnHold: number;
  totalValueInWarehouse: number; // USD
  pendingPayments: number; // USD
}
