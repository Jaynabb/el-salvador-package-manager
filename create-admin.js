/**
 * Create Master Admin Account - Non-interactive version
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

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
  // Default credentials
  const email = 'admin@importflow.com';
  const password = 'Admin123!';
  const displayName = 'Jamari McNabb';

  console.log('\n=================================');
  console.log('📦 ImportFlow - Master Admin Setup');
  console.log('=================================\n');
  console.log('Creating master admin account...\n');

  try {
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
      importerId: null,
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
    console.log('\nYou can now sign in to ImportFlow with these credentials.');
    console.log('IMPORTANT: Change your password after first login!');
    console.log('=================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating master admin:', error.message);

    if (error.code === 'auth/email-already-in-use') {
      console.log('\n✅ Account already exists! You can log in with:');
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
    }

    process.exit(1);
  }
}

createMasterAdmin();
