import { collection, query, getDocs, doc, setDoc, Timestamp, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from './firebase';
import type { User, UserRole } from '../types';

export const getUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db!, 'users');
    const q = query(usersRef);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        importerId: data.importerId,
        status: data.status,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
        lastLogin: data.lastLogin?.toDate()
      } as User;
    });
  } catch (error) {
    console.error('Error getting users:', error);
    throw error;
  }
};

export const createUser = async (
  email: string,
  password: string,
  displayName: string,
  role: UserRole,
  importerId?: string
): Promise<string> => {
  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth!, email, password);
    const uid = userCredential.user.uid;

    // Create user document in Firestore
    const now = new Date();
    await setDoc(doc(db!, 'users', uid), {
      email,
      displayName,
      role,
      importerId: importerId || null,
      status: 'active',
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    });

    return uid;
  } catch (error: any) {
    console.error('Error creating user:', error);
    // Clean up if user was created in Auth but Firestore failed
    throw error;
  }
};

export const deactivateUser = async (uid: string): Promise<void> => {
  try {
    await setDoc(doc(db!, 'users', uid), {
      status: 'inactive',
      updatedAt: Timestamp.fromDate(new Date())
    }, { merge: true });
  } catch (error) {
    console.error('Error deactivating user:', error);
    throw error;
  }
};

export const reactivateUser = async (uid: string): Promise<void> => {
  try {
    await setDoc(doc(db!, 'users', uid), {
      status: 'active',
      updatedAt: Timestamp.fromDate(new Date())
    }, { merge: true });
  } catch (error) {
    console.error('Error reactivating user:', error);
    throw error;
  }
};
