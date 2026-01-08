/**
 * Make user a master admin
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const USER_EMAIL = 'jay@tastybuilds.com';

async function makeAdmin() {
  console.log('\n=================================');
  console.log('👑 Making User Master Admin');
  console.log('=================================\n');

  try {
    // We need to find the user by email
    // Since we can't query by email directly without knowing the UID,
    // we'll need to get it from Firebase Auth

    console.log(`Target user: ${USER_EMAIL}`);
    console.log('\n⚠️  We need the User UID from Firebase Console\n');
    console.log('Steps:');
    console.log('1. Go to Firebase Console > Authentication');
    console.log('2. Find user: jay@tastybuilds.com');
    console.log('3. Copy the User UID (looks like: aBcD1234...)');
    console.log('4. Paste it here when prompted\n');

    // For now, let's create a direct update script
    console.log('Or I can create the Firestore document directly...\n');

    // Alternative: We'll create/update the document with a known structure
    console.log('✅ Ready to update. Please provide the User UID from Firebase Console.');
    console.log('\nOnce you have it, I will update the Firestore document.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

makeAdmin();
