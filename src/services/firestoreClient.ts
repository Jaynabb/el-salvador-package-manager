import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  Timestamp,
  QueryConstraint
} from 'firebase/firestore';
import { db, DEMO_MODE } from './firebase';
import type { Package, Customer, ActivityLog, SMSNotification } from '../types';

// Demo data storage (in-memory)
let demoPackages: Package[] = [
  {
    id: 'demo-1',
    trackingNumber: 'US1234567890',
    status: 'received',
    customerId: 'cust-1',
    customerName: 'Juan Perez',
    customerPhone: '+503 7777-8888',
    customerEmail: 'juan.perez@email.com',
    origin: 'Miami, FL, USA',
    carrier: 'DHL Express',
    totalWeight: 2.5,
    items: [
      {
        name: 'iPhone 15 Pro',
        description: 'Smartphone - 256GB',
        quantity: 1,
        unitValue: 999,
        totalValue: 999,
        hsCode: '8517.12.00'
      },
      {
        name: 'AirPods Pro',
        description: 'Wireless Earbuds',
        quantity: 1,
        unitValue: 249,
        totalValue: 249,
        hsCode: '8518.30.00'
      }
    ],
    totalValue: 1248,
    customsDeclaration: {
      declaredValue: 1248,
      currency: 'USD',
      purpose: 'Personal Use',
      certificateOfOrigin: true,
      specialPermitsRequired: false
    },
    customsDuty: 187.20,
    vat: 186.68,
    totalFees: 373.88,
    paymentStatus: 'pending',
    receivedDate: new Date('2025-11-25'),
    createdAt: new Date('2025-11-25'),
    updatedAt: new Date('2025-11-25'),
    notes: 'Customer called to confirm package receipt'
  },
  {
    id: 'demo-2',
    trackingNumber: 'US0987654321',
    status: 'customs-cleared',
    customerId: 'cust-2',
    customerName: 'Maria Rodriguez',
    customerPhone: '+503 6666-5555',
    customerEmail: 'maria.r@email.com',
    origin: 'Los Angeles, CA, USA',
    carrier: 'FedEx International',
    totalWeight: 1.2,
    items: [
      {
        name: 'Nike Air Max',
        description: 'Running Shoes - Size 8',
        quantity: 2,
        unitValue: 120,
        totalValue: 240,
        hsCode: '6403.91.00'
      }
    ],
    totalValue: 240,
    customsDeclaration: {
      declaredValue: 240,
      currency: 'USD',
      purpose: 'Personal Use',
      certificateOfOrigin: true,
      specialPermitsRequired: false
    },
    customsDuty: 0,
    vat: 31.20,
    totalFees: 31.20,
    paymentStatus: 'pending',
    receivedDate: new Date('2025-11-24'),
    customsClearedDate: new Date('2025-11-26'),
    createdAt: new Date('2025-11-24'),
    updatedAt: new Date('2025-11-26')
  },
  {
    id: 'demo-3',
    trackingNumber: 'US1122334455',
    status: 'delivered',
    customerId: 'cust-3',
    customerName: 'Carlos Hernandez',
    customerPhone: '+503 7555-4444',
    origin: 'New York, NY, USA',
    carrier: 'UPS',
    totalWeight: 0.5,
    items: [
      {
        name: 'MacBook Pro Charger',
        description: '96W USB-C Power Adapter',
        quantity: 1,
        unitValue: 79,
        totalValue: 79,
        hsCode: '8504.40.00'
      }
    ],
    totalValue: 79,
    customsDeclaration: {
      declaredValue: 79,
      currency: 'USD',
      purpose: 'Personal Use',
      certificateOfOrigin: true,
      specialPermitsRequired: false
    },
    customsDuty: 0,
    vat: 10.27,
    totalFees: 10.27,
    paymentStatus: 'paid',
    receivedDate: new Date('2025-11-20'),
    customsClearedDate: new Date('2025-11-22'),
    deliveredDate: new Date('2025-11-23'),
    createdAt: new Date('2025-11-20'),
    updatedAt: new Date('2025-11-23')
  }
];

let demoCustomers: Customer[] = [];
let demoActivityLogs: ActivityLog[] = [];
let demoSMSNotifications: SMSNotification[] = [];

// Packages
export const addPackage = async (packageData: Omit<Package, 'id' | 'createdAt' | 'updatedAt'>) => {
  const packagesRef = collection(db, 'packages');
  const now = new Date();
  const docRef = await addDoc(packagesRef, {
    ...packageData,
    receivedDate: Timestamp.fromDate(packageData.receivedDate),
    customsClearedDate: packageData.customsClearedDate
      ? Timestamp.fromDate(packageData.customsClearedDate)
      : null,
    deliveredDate: packageData.deliveredDate
      ? Timestamp.fromDate(packageData.deliveredDate)
      : null,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now)
  });
  return docRef.id;
};

export const getPackages = async (filters?: { status?: string; customerId?: string; organizationId?: string }) => {
  if (DEMO_MODE || !db) {
    // Return demo data
    let filtered = [...demoPackages];
    if (filters?.status) {
      filtered = filtered.filter(p => p.status === filters.status);
    }
    if (filters?.customerId) {
      filtered = filtered.filter(p => p.customerId === filters.customerId);
    }
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const packagesRef = collection(db, 'packages');
  const constraints: QueryConstraint[] = [];

  // Organization filter is required for security rules
  if (filters?.organizationId) {
    constraints.push(where('organizationId', '==', filters.organizationId));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters?.customerId) {
    constraints.push(where('customerId', '==', filters.customerId));
  }

  const q = query(packagesRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      receivedDate: data.receivedDate?.toDate(),
      customsClearedDate: data.customsClearedDate?.toDate(),
      deliveredDate: data.deliveredDate?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate()
    } as Package;
  });
};

export const getPackageById = async (id: string) => {
  const docRef = doc(db, 'packages', id);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      receivedDate: data.receivedDate?.toDate(),
      customsClearedDate: data.customsClearedDate?.toDate(),
      deliveredDate: data.deliveredDate?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate()
    } as Package;
  }
  return null;
};

export const updatePackage = async (id: string, updates: Partial<Package>) => {
  if (DEMO_MODE || !db) {
    // Update demo data
    const index = demoPackages.findIndex(p => p.id === id);
    if (index !== -1) {
      demoPackages[index] = {
        ...demoPackages[index],
        ...updates,
        updatedAt: new Date()
      };
    }
    return;
  }

  const docRef = doc(db, 'packages', id);
  const updateData: any = {
    ...updates,
    updatedAt: Timestamp.fromDate(new Date())
  };

  // Convert dates to Timestamps
  if (updates.receivedDate) {
    updateData.receivedDate = Timestamp.fromDate(updates.receivedDate);
  }
  if (updates.customsClearedDate) {
    updateData.customsClearedDate = Timestamp.fromDate(updates.customsClearedDate);
  }
  if (updates.deliveredDate) {
    updateData.deliveredDate = Timestamp.fromDate(updates.deliveredDate);
  }

  await updateDoc(docRef, updateData);
};

export const deletePackage = async (id: string) => {
  const docRef = doc(db, 'packages', id);
  await deleteDoc(docRef);
};

// Customers
export const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt'>) => {
  const customersRef = collection(db, 'customers');
  const docRef = await addDoc(customersRef, {
    ...customer,
    createdAt: Timestamp.fromDate(new Date())
  });
  return docRef.id;
};

export const getCustomers = async () => {
  const customersRef = collection(db, 'customers');
  const q = query(customersRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate()
    } as Customer;
  });
};

export const getCustomerById = async (id: string) => {
  const docRef = doc(db, 'customers', id);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate()
    } as Customer;
  }
  return null;
};

export const findCustomerByPhone = async (phone: string) => {
  const customersRef = collection(db, 'customers');
  const q = query(customersRef, where('phone', '==', phone));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate()
    } as Customer;
  }
  return null;
};

// Activity Logs
export const addActivityLog = async (log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
  if (DEMO_MODE || !db) {
    // Add to demo data
    const newLog: ActivityLog = {
      ...log,
      id: `log-${Date.now()}`,
      timestamp: new Date()
    };
    demoActivityLogs.push(newLog);
    return newLog.id;
  }

  const logsRef = collection(db, 'activityLogs');
  const docRef = await addDoc(logsRef, {
    ...log,
    timestamp: Timestamp.fromDate(new Date())
  });
  return docRef.id;
};

export const getActivityLogs = async (packageId?: string) => {
  const logsRef = collection(db, 'activityLogs');
  const constraints: QueryConstraint[] = [orderBy('timestamp', 'desc')];

  if (packageId) {
    constraints.push(where('packageId', '==', packageId));
  }

  const q = query(logsRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      timestamp: data.timestamp?.toDate()
    } as ActivityLog;
  });
};

// SMS Notifications
export const addSMSNotification = async (notification: Omit<SMSNotification, 'id' | 'createdAt'>) => {
  const smsRef = collection(db, 'smsNotifications');
  const docRef = await addDoc(smsRef, {
    ...notification,
    createdAt: Timestamp.fromDate(new Date()),
    sentAt: notification.sentAt ? Timestamp.fromDate(notification.sentAt) : null
  });
  return docRef.id;
};

export const updateSMSNotification = async (id: string, updates: Partial<SMSNotification>) => {
  const docRef = doc(db, 'smsNotifications', id);
  const updateData: any = { ...updates };

  if (updates.sentAt) {
    updateData.sentAt = Timestamp.fromDate(updates.sentAt);
  }

  await updateDoc(docRef, updateData);
};

// Batch Access Control for SMS/WhatsApp Commands

/**
 * Get batch by ID with phone number verification
 * Used by SMS/WhatsApp webhook handlers to ensure users can only access their own batches
 *
 * @param batchId - The batch ID
 * @param phoneNumber - Phone number to verify access (optional for backward compatibility)
 * @returns Batch data or null if not found or access denied
 */
export const getBatchByIdAndPhone = async (
  batchId: string,
  phoneNumber?: string
): Promise<any | null> => {
  try {
    const batchRef = doc(db, 'batches', batchId);
    const batchDoc = await getDoc(batchRef);

    if (!batchDoc.exists()) {
      return null;
    }

    const batch = {
      id: batchDoc.id,
      ...batchDoc.data(),
      createdAt: batchDoc.data().createdAt?.toDate(),
      updatedAt: batchDoc.data().updatedAt?.toDate()
    };

    // If phone number provided, verify access
    // For now, we'll allow access if phoneNumber is not set on batch
    // In production, you'd want stricter access control
    if (phoneNumber && batch.phoneNumber && batch.phoneNumber !== phoneNumber) {
      console.warn(`Access denied: ${phoneNumber} tried to access batch ${batchId} owned by ${batch.phoneNumber}`);
      return null;
    }

    return batch;
  } catch (error) {
    console.error('Error getting batch:', error);
    return null;
  }
};

/**
 * Get all screenshots for a batch
 * Used by SMS/WhatsApp export commands
 *
 * @param batchId - The batch ID
 * @returns Array of screenshots
 */
export const getScreenshotsByBatchId = async (batchId: string): Promise<any[]> => {
  try {
    const screenshotsRef = collection(db, 'screenshots');
    const q = query(screenshotsRef, where('batchId', '==', batchId));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      uploadedAt: doc.data().uploadedAt?.toDate(),
      processedAt: doc.data().processedAt?.toDate()
    }));
  } catch (error) {
    console.error('Error getting screenshots:', error);
    return [];
  }
};

/**
 * Link a phone number to a batch
 * Call this when a batch is created via WhatsApp/SMS
 *
 * @param batchId - The batch ID
 * @param phoneNumber - Phone number to link
 */
export const linkPhoneNumberToBatch = async (
  batchId: string,
  phoneNumber: string
): Promise<void> => {
  try {
    const batchRef = doc(db, 'batches', batchId);
    await updateDoc(batchRef, {
      phoneNumber,
      updatedAt: Timestamp.fromDate(new Date())
    });
    console.log(`✓ Linked ${phoneNumber} to batch ${batchId}`);
  } catch (error) {
    console.error('Error linking phone number:', error);
    throw error;
  }
};
