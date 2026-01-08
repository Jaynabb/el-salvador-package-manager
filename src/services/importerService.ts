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
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { Importer } from '../types';

// Create new importer
export const addImporter = async (importerData: Omit<Importer, 'id' | 'createdAt' | 'updatedAt'>) => {
  const importersRef = collection(db!, 'importers');
  const now = new Date();

  const docRef = await addDoc(importersRef, {
    ...importerData,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now)
  });

  return docRef.id;
};

// Get all importers
export const getImporters = async (activeOnly: boolean = false) => {
  const importersRef = collection(db!, 'importers');
  const constraints = [orderBy('businessName', 'asc')];

  if (activeOnly) {
    constraints.push(where('status', '==', 'active'));
  }

  const q = query(importersRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate()
    } as Importer;
  });
};

// Get single importer by ID
export const getImporterById = async (id: string) => {
  const docRef = doc(db!, 'importers', id);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate()
    } as Importer;
  }
  return null;
};

// Update importer
export const updateImporter = async (id: string, updates: Partial<Importer>) => {
  const docRef = doc(db!, 'importers', id);
  const updateData: any = {
    ...updates,
    updatedAt: Timestamp.fromDate(new Date())
  };

  await updateDoc(docRef, updateData);
};

// Delete importer (soft delete by setting status to inactive)
export const deactivateImporter = async (id: string) => {
  await updateImporter(id, { status: 'inactive' });
};

// Hard delete importer
export const deleteImporter = async (id: string) => {
  const docRef = doc(db!, 'importers', id);
  await deleteDoc(docRef);
};
