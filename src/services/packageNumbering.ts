import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Sequential Package Numbering Service
 * Generates sequential package numbers: Paquete #1, Paquete #2, etc.
 */

/**
 * Get the next sequential package number for an organization
 * Format: "Paquete #1", "Paquete #2", etc.
 */
export const getNextPackageNumber = async (organizationId: string): Promise<{
  packageNumber: string;
  sequenceNumber: number;
}> => {
  try {
    // Query for the highest sequence number in this organization
    const docsRef = collection(db, 'docs');
    const q = query(
      docsRef,
      where('organizationId', '==', organizationId),
      where('sequenceNumber', '!=', null),
      orderBy('sequenceNumber', 'desc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);

    let nextSequence = 1;

    if (!querySnapshot.empty) {
      const lastDoc = querySnapshot.docs[0];
      const lastSequence = lastDoc.data().sequenceNumber as number;
      nextSequence = lastSequence + 1;
    }

    return {
      packageNumber: `Paquete #${nextSequence}`,
      sequenceNumber: nextSequence
    };
  } catch (error) {
    console.error('Error getting next package number:', error);

    // Fallback: generate based on timestamp
    const timestamp = Date.now();
    const fallbackSequence = timestamp % 10000;

    return {
      packageNumber: `Paquete #${fallbackSequence}`,
      sequenceNumber: fallbackSequence
    };
  }
};

/**
 * Get the next sequential package number for an importer (legacy)
 */
export const getNextPackageNumberForImporter = async (importerId: string): Promise<{
  packageNumber: string;
  sequenceNumber: number;
}> => {
  try {
    const docsRef = collection(db, 'docs');
    const q = query(
      docsRef,
      where('importerId', '==', importerId),
      where('sequenceNumber', '!=', null),
      orderBy('sequenceNumber', 'desc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);

    let nextSequence = 1;

    if (!querySnapshot.empty) {
      const lastDoc = querySnapshot.docs[0];
      const lastSequence = lastDoc.data().sequenceNumber as number;
      nextSequence = lastSequence + 1;
    }

    return {
      packageNumber: `Paquete #${nextSequence}`,
      sequenceNumber: nextSequence
    };
  } catch (error) {
    console.error('Error getting next package number:', error);

    const timestamp = Date.now();
    const fallbackSequence = timestamp % 10000;

    return {
      packageNumber: `Paquete #${fallbackSequence}`,
      sequenceNumber: fallbackSequence
    };
  }
};

/**
 * Format a sequence number as a package number
 */
export const formatPackageNumber = (sequenceNumber: number): string => {
  return `Paquete #${sequenceNumber}`;
};

/**
 * Parse a package number to get the sequence number
 * Example: "Paquete #42" → 42
 */
export const parsePackageNumber = (packageNumber: string): number | null => {
  const match = packageNumber.match(/Paquete #(\d+)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
};

/**
 * Validate that a package number follows the correct format
 */
export const isValidPackageNumber = (packageNumber: string): boolean => {
  return /^Paquete #\d+$/i.test(packageNumber);
};

/**
 * Get all package numbers for an organization (for debugging/admin)
 */
export const getAllPackageNumbers = async (organizationId: string): Promise<Array<{
  docId: string;
  packageNumber: string;
  sequenceNumber: number;
  customerName?: string;
}>> => {
  try {
    const docsRef = collection(db, 'docs');
    const q = query(
      docsRef,
      where('organizationId', '==', organizationId),
      where('sequenceNumber', '!=', null),
      orderBy('sequenceNumber', 'asc')
    );

    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      docId: doc.id,
      packageNumber: doc.data().packageNumber as string,
      sequenceNumber: doc.data().sequenceNumber as number,
      customerName: doc.data().customerName as string | undefined
    }));
  } catch (error) {
    console.error('Error getting all package numbers:', error);
    return [];
  }
};
