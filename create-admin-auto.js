/**
 * Automated Admin Account Creation
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createMasterAdmin() {
  console.log('\n=================================');
  console.log('📦 ImportFlow - Master Admin Setup');
  console.log('=================================\n');

  const email = 'admin@importflow.com';
  const password = 'ImportFlow2024!';
  const displayName = 'System Administrator';

  try {
    console.log('🔄 Creating master admin account...\n');

    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    console.log('✅ User created in Firebase Auth');

    // Create user document in Firestore
    const now = new Date();
    await setDoc(doc(db, 'users', uid), {
      email,
      displayName,
      role: 'master-admin',
      organizationId: null,
      status: 'active',
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    });

    console.log('✅ User document created in Firestore');
    console.log('\n=================================');
    console.log('✨ Master Admin Account Created!');
    console.log('=================================');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Name: ${displayName}`);
    console.log(`Role: master-admin`);
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    console.log('=================================\n');

  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('\n✅ Admin account already exists!');
      console.log(`Email: ${email}`);
      console.log('\nIf you forgot your password, you can reset it from the login page.');
    } else {
      console.error('\n❌ Error creating master admin:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

createMasterAdmin();
