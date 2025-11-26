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
import { db } from './firebase';
import type { Package, Customer, ActivityLog, SMSNotification } from '../types';

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

export const getPackages = async (filters?: { status?: string; customerId?: string }) => {
  const packagesRef = collection(db, 'packages');
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

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
