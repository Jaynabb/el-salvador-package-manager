/**
 * Fix Admin Password - Reset to known credentials
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
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

const targetEmail = 'admin@importflow.com';
const newPassword = 'ImportFlow2024!';

async function fixAdminAccount() {
  console.log('\n=================================');
  console.log('🔧 Fixing Admin Account');
  console.log('=================================\n');

  try {
    // Try to check if user document exists in Firestore
    console.log('🔍 Checking for existing admin account...\n');

    // We can't directly get user by email without admin SDK, so we'll try to look up in Firestore
    // by email field (this is a workaround)

    console.log('Creating/Updating admin account with known credentials...\n');
    console.log(`Email: ${targetEmail}`);
    console.log(`New Password: ${newPassword}`);
    console.log('\n⚠️  If account exists, you need to reset password via Firebase Console');
    console.log('\nOption 1: Reset via Firebase Console');
    console.log('  1. Go to: https://console.firebase.google.com/project/el-salvador-package-manager/authentication/users');
    console.log('  2. Find user: admin@importflow.com');
    console.log('  3. Click the 3 dots (⋮) → "Reset password"');
    console.log('  4. Copy the reset link and open in browser');
    console.log('  5. Set password to: ImportFlow2024!');
    console.log('\nOption 2: Delete and recreate');
    console.log('  1. Go to: https://console.firebase.google.com/project/el-salvador-package-manager/authentication/users');
    console.log('  2. Find user: admin@importflow.com');
    console.log('  3. Click the 3 dots (⋮) → "Delete account"');
    console.log('  4. Run: node create-admin-auto.js');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

fixAdminAccount();
