import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import type { User, UserRole } from '../types';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isMasterAdmin: boolean;
  isImporterAdmin: boolean;
  isImporterUser: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user data from Firestore
  const loadUserData = async (firebaseUser: FirebaseUser): Promise<User | null> => {
    if (!db) {
      console.error('Firestore not initialized!');
      return null;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();

        // Load organization name if user belongs to an organization
        let organizationName: string | undefined;
        const orgId = userData.organizationId || userData.importerId;
        if (orgId) {
          try {
            const orgDoc = await getDoc(doc(db, 'organizations', orgId));
            if (orgDoc.exists()) {
              organizationName = orgDoc.data().organizationName;
            }
          } catch (error) {
            console.error('Error loading organization name:', error);
          }
        }

        // Update last login
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          lastLogin: Timestamp.fromDate(new Date())
        }, { merge: true });

        return {
          uid: firebaseUser.uid,
          email: userData.email,
          displayName: userData.displayName,
          role: userData.role,
          organizationId: orgId,
          organizationName,
          importerId: userData.importerId,
          status: userData.status,
          phoneNumber: userData.phoneNumber,
          requirePasswordChange: userData.requirePasswordChange,
          passwordChangedAt: userData.passwordChangedAt?.toDate(),
          createdAt: userData.createdAt?.toDate(),
          updatedAt: userData.updatedAt?.toDate(),
          lastLogin: new Date(),
          invitedBy: userData.invitedBy
        } as User;
      }

      return null;
    } catch (error) {
      console.error('Error loading user data:', error);
      return null;
    }
  };

  // Listen to auth state changes
  useEffect(() => {
    if (!auth) {
      console.error('Firebase Auth not initialized!');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      if (firebaseUser) {
        const userData = await loadUserData(firebaseUser);
        setCurrentUser(userData);
      } else {
        setCurrentUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const userData = await loadUserData(result.user);

      if (!userData) {
        throw new Error('User data not found');
      }

      if (userData.status === 'inactive') {
        await firebaseSignOut(auth);
        throw new Error('Account is inactive. Contact your administrator.');
      }

      setCurrentUser(userData);
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    await firebaseSignOut(auth);
    setCurrentUser(null);
    setFirebaseUser(null);
  };

  const value: AuthContextType = {
    currentUser,
    firebaseUser,
    loading,
    signIn,
    signOut,
    isMasterAdmin: currentUser?.role === 'master-admin',
    isImporterAdmin: currentUser?.role === 'importer-admin',
    isImporterUser: currentUser?.role === 'importer-user'
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
