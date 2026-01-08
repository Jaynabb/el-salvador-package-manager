/**
 * Setup Script for Creating Master Admin Account
 *
 * This script creates the initial master admin account for ImportFlow.
 * Run this once to set up your admin access.
 *
 * Usage:
 * 1. Make sure Firebase is configured in .env.local
 * 2. Run: node setup-admin.js
 * 3. Follow the prompts to enter admin details
 * 4. The script will create the account in Firebase Auth and Firestore
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import * as readline from 'readline';

// Load environment variables
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createMasterAdmin() {
  console.log('\n=================================');
  console.log('📦 ImportFlow - Master Admin Setup');
  console.log('=================================\n');

  try {
    const email = await question('Enter admin email: ');
    const password = await question('Enter admin password (min 6 chars): ');
    const displayName = await question('Enter admin display name: ');

    console.log('\n🔄 Creating master admin account...\n');

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
    console.log(`Name: ${displayName}`);
    console.log(`Role: master-admin`);
    console.log('\nYou can now sign in to ImportFlow with these credentials.');
    console.log('=================================\n');

  } catch (error) {
    console.error('\n❌ Error creating master admin:', error.message);
    console.error('\nPlease ensure:');
    console.error('1. Firebase is properly configured in .env.local');
    console.error('2. The email is valid and not already registered');
    console.error('3. The password is at least 6 characters');
  } finally {
    rl.close();
    process.exit(0);
  }
}

createMasterAdmin();
