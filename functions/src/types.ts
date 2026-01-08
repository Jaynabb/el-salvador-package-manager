/**
 * TypeScript type definitions for Cloud Functions
 */

export interface Batch {
  id: string;
  importerId: string;
  customerName: string | null;
  customerPhone: string;
  screenshotIds: string[];
  screenshotCount: number;
  status: "active" | "ready" | "processing" | "exported" | "completed";
  hasWhatsAppScreenshots: boolean;
  hasManualScreenshots: boolean;
  weight?: number;
  weightUnit?: string;
  packageNumber?: string;
  customsDuty?: number;
  vat?: number;
  totalFees?: number;
  paymentStatus?: string;
  documentUrl?: string;
  exportedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Screenshot {
  id: string;
  batchId: string;
  importerId: string;
  source: "whatsapp" | "manual";
  imageBase64: string;
  imageType: string;
  extractionStatus: "pending" | "processing" | "completed" | "error";
  extractedData?: ExtractedData;
  extractionError?: string;
  uploadedAt: Date;
  processedAt?: Date;
}

export interface ExtractedData {
  trackingNumber?: string | null;
  orderNumber?: string | null;
  seller?: string | null;
  orderDate?: string | null;
  items: Item[];
  orderTotal?: number | null;
}

export interface Item {
  name: string;
  description?: string | null;
  quantity: number;
  unitValue: number;
  totalValue: number;
  category: string;
  hsCode?: string;
  weight?: number;
}

export interface Importer {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone?: string;
  status: "active" | "inactive";
  phoneRegisteredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  importerId: string;
  createdAt: Date;
}

export interface Package {
  id: string;
  packageNumber: string;
  trackingNumbers: string[];
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: Item[];
  totalValue: number;
  screenshotCount: number;
  screenshotIds: string[];
  customsDeclaration: CustomsDeclaration;
  customsDuty: number;
  vat: number;
  totalFees: number;
  status: string;
  paymentStatus: string;
  orderDate: Date;
  documentUrls?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomsDeclaration {
  declaredValue: number;
  currency: string;
  purpose: string;
  estimatedDuty: number;
  estimatedVAT: number;
  certificateOfOrigin?: boolean;
}
