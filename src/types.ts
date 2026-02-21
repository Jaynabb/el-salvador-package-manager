// User Roles
export type UserRole = 'master-admin' | 'importer-admin' | 'importer-user' | 'organization-owner' | 'organization-member';

// Subscription Status
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'suspended';

// Subscription Tier
export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';

// Organization (multi-tenant support)
export interface Organization {
  id: string;
  organizationName: string;
  contactName?: string; // Primary contact name
  contactEmail?: string; // Primary contact email
  contactPhone?: string; // Primary contact phone
  address?: string; // Organization address
  subscriptionStatus: SubscriptionStatus;
  subscriptionTier: SubscriptionTier;
  ownerId: string; // User ID of organization owner
  memberCount: number;
  maxMembers: number; // Based on tier
  billingEmail: string;
  paymentMethodId?: string; // Stripe payment method ID
  customerId?: string; // Stripe customer ID
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialEndsAt?: Date;
  cancelledAt?: Date;

  // Google OAuth Integration
  googleConnected?: boolean; // Whether Google account is connected
  googleAccessToken?: string; // Encrypted OAuth access token
  googleRefreshToken?: string; // Encrypted refresh token
  googleTokenExpiry?: Date; // When access token expires
  googleEmail?: string; // Connected Google account email
  googleDriveFolderId?: string; // Auto-created ImportFlow folder ID
  googleSheetId?: string; // Main tracking sheet ID
  activeGoogleDocId?: string; // Current active Google Doc for appending exports
  activeGoogleSheetId?: string; // Current active customs Google Sheet for appending exports

  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;

  // Usage Tracking (for billing)
  aiExtractionsCount?: number; // Total number of AI extractions (screenshots analyzed)
  totalAICost?: number; // Total estimated cost in USD
  lastExtractionAt?: Date; // Timestamp of last AI extraction
  currentMonthExtractions?: number; // Extractions in current billing month
  currentMonthCost?: number; // Cost for current billing month
  usageResetAt?: Date; // When current month usage was last reset
}

// User (for authentication and access control)
export interface User {
  uid: string; // Firebase Auth UID
  email: string;
  displayName: string;
  role: UserRole;
  organizationId?: string; // Organization this user belongs to
  organizationName?: string; // Organization name (loaded from organization doc)
  importerId?: string; // Deprecated - use organizationId
  status: 'active' | 'inactive' | 'pending';
  phoneNumber?: string; // For WhatsApp integration
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  invitedBy?: string; // User ID who invited this user
  requirePasswordChange?: boolean; // True if user must change password on first login
  passwordChangedAt?: Date; // When password was last changed
}

// Organization Invite
export interface OrganizationInvite {
  id: string;
  organizationId: string;
  email: string;
  role: 'organization-member' | 'importer-admin';
  invitedBy: string; // User ID
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

// Importer/Client (businesses using the system)
export interface Importer {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address?: string;
  googleSheetsWebhookUrl?: string; // Legacy webhook URL (deprecated)

  // Google OAuth Integration (new approach)
  googleConnected?: boolean; // Whether Google account is connected
  googleAccessToken?: string; // Encrypted OAuth access token
  googleRefreshToken?: string; // Encrypted refresh token
  googleTokenExpiry?: Date; // When access token expires
  googleEmail?: string; // Connected Google account email
  googleDriveFolderId?: string; // Auto-created ImportFlow folder ID
  googleSheetId?: string; // Main tracking sheet ID

  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
}

// Customer Information
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  importerId: string; // Which importer this customer belongs to
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

// Screenshot (unified storage for WhatsApp and manual uploads)
export interface Screenshot {
  id: string;
  docId?: string; // Links to active doc (optional if not yet assigned)
  imageBase64: string;
  imageType: string;
  source: 'whatsapp' | 'manual'; // How it was uploaded

  // Customer information
  customerName?: string; // Name of the customer who sent this
  phoneNumber?: string; // Phone number (for WhatsApp screenshots)

  // AI extraction results
  extractedData?: ExtractedOrderData;
  extractionStatus: 'pending' | 'completed' | 'error';
  extractionError?: string;

  importerId?: string;
  organizationId?: string;
  uploadedAt: Date;
  processedAt?: Date;
}

// Doc (groups screenshots for export to Google Doc)
export interface Doc {
  id: string;
  importerId: string;
  organizationId?: string;
  customerName?: string; // Importer sets this

  // Screenshots in this doc (from WhatsApp + manual uploads)
  screenshotIds: string[];
  screenshotCount: number;

  // Doc status
  status: 'completed' | 'draft';

  // Human review requirement
  humanReviewed?: boolean; // Must be true before export
  reviewedBy?: string; // User ID who reviewed
  reviewedAt?: Date; // When reviewed

  // Mixed source tracking
  hasWhatsAppScreenshots: boolean;
  hasManualScreenshots: boolean;

  // Weight (importer can add via WhatsApp or web)
  weight?: number; // Weight value
  weightUnit?: 'kg' | 'lb'; // Weight unit

  // Calculated totals from all screenshots
  totalValue?: number; // Sum of all order totals
  totalPieces?: number; // Total pieces count from all screenshots
  trackingNumbers?: string[]; // All tracking numbers from screenshots
  trackingNumbersLast4?: string[]; // Last 4 of tracking numbers

  // MVP: Sequential package numbering
  packageNumber?: string; // Sequential: "Paquete #1", "Paquete #2", etc.
  sequenceNumber?: number; // Numeric sequence for sorting

  // MVP: Google Sheets fields
  dateArrived?: Date; // When first screenshot was scanned
  consignee?: string; // Customer name (same as customerName)
  company?: string; // Detected company (Amazon, Shein, etc.)
  outboundTrackingNumber?: string; // Tracking number when sending to customer
  dateDelivered?: Date; // When delivered to customer

  // Tax split detection
  isTaxSplit?: boolean; // True if flagged as tax split
  taxSplitReason?: string; // Reason for tax split flag

  // Result after processing
  packageId?: string;
  googleDocUrl?: string;
  googleSheetUrl?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Extracted data from order screenshot
export interface ExtractedOrderData {
  // Customer information
  customerName?: string; // Extracted from screenshot if available

  // Tracking and order info
  trackingNumber?: string; // Full tracking number
  trackingNumberLast4?: string; // Last 4 digits for easy reference
  orderNumber?: string;
  orderDate?: string;

  // Company/seller info
  seller?: string; // Amazon, Shein, etc.
  company?: string; // Same as seller, standardized company name

  // Logistics carriers
  carriers?: string[]; // Array of shipping carriers (USPS, UPS, FedEx, DHL, etc.) - multiple if multiple shipments

  // Items and pricing
  items: PackageItem[];
  orderTotal?: number;
  totalPieces?: number; // Total pieces count (accounting for quantity multiples)

  // Tax split detection
  isTaxSplit?: boolean; // True if this appears to be a tax split scenario
  taxSplitReason?: string; // Why it was flagged as tax split
}

// Per-screenshot breakdown for document
export interface ScreenshotBreakdown {
  screenshotNumber: number; // 1, 2, 3, etc.
  source: 'whatsapp' | 'manual';
  extractedData: ExtractedOrderData;
  screenshotTotal: number; // Sum of items from this screenshot
}

// Package Status
export type PackageStatus =
  | 'pending-arrival' // Order placed, awaiting arrival
  | 'received' // Package received at warehouse
  | 'customs-pending' // Awaiting customs clearance
  | 'customs-cleared' // Cleared by customs
  | 'ready-pickup' // Ready for customer pickup
  | 'delivered' // Delivered to customer
  | 'on-hold'; // On hold for issues

// Main Package
export interface Package {
  id: string;
  packageNumber: string; // Custom number: PKG-2025-11-001
  trackingNumbers: string[]; // Array of all tracking numbers from all screenshots
  importerId: string; // Which importer this package belongs to
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;

  // Package Details
  items: PackageItem[];
  totalValue: number; // Sum of all item values
  totalWeight?: number; // Total weight in kg
  origin?: string; // e.g., "United States", "China"
  carrier?: string; // e.g., "DHL", "FedEx", "USPS"

  // Screenshot tracking
  screenshotCount: number; // How many screenshots were processed
  screenshotIds: string[]; // IDs of the screenshots used
  screenshotBreakdown?: ScreenshotBreakdown[]; // Per-screenshot details for document

  // Customs Information
  customsDeclaration: CustomsDeclaration;

  // Status & Tracking
  status: PackageStatus;
  orderDate?: Date; // When order was placed
  receivedDate?: Date; // When package arrived at warehouse
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
