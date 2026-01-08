/**
 * Create Firestore User Document
 * Fixes: "User exists in Auth but not in Firestore"
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
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
const auth = getAuth(app);
const db = getFirestore(app);

// EDIT THESE:
const EMAIL = 'jay@tastybuilds.com';
const PASSWORD = 'Jaynabb94!'; // The password you just set via password reset

async function createFirestoreDoc() {
  console.log('\n=================================');
  console.log('🔧 Creating Firestore User Document');
  console.log('=================================\n');

  try {
    console.log(`Step 1: Signing in as ${EMAIL}...\n`);

    // Sign in to get the UID
    const userCredential = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = userCredential.user.uid;

    console.log('✅ Sign in successful!');
    console.log(`   User UID: ${uid}\n`);

    console.log('Step 2: Creating Firestore document...\n');

    // Create the Firestore user document
    await setDoc(doc(db, 'users', uid), {
      email: EMAIL,
      displayName: 'Jay',
      role: 'master-admin',
      organizationId: null,
      status: 'active',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }, { merge: true }); // merge: true won't overwrite if exists

    console.log('✅ Firestore document created!\n');

    console.log('=================================');
    console.log('✨ SUCCESS!');
    console.log('=================================');
    console.log('Your account is now fully set up!');
    console.log('');
    console.log('Login at: https://importflow-app.web.app');
    console.log(`Email: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log('Role: Master Admin');
    console.log('=================================\n');

  } catch (error) {
    console.log('\n❌ Error occurred:\n');

    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      console.log('The password is incorrect.');
      console.log('\nPlease reset your password first:');
      console.log('1. Go to: https://console.firebase.google.com/project/el-salvador-package-manager/authentication/users');
      console.log('2. Find: jay@tastybuilds.com');
      console.log('3. Click the 3 dots (⋮) → "Reset password"');
      console.log('4. Open the reset link and set password to: Jaynabb94!');
      console.log('5. Run this script again: node create-firestore-user-doc.js\n');
    } else if (error.code === 'auth/user-not-found') {
      console.log('User not found in Firebase Auth.');
      console.log('The account may have been deleted. Create a new one with:');
      console.log('node create-custom-admin.js\n');
    } else {
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);
      console.log('\nPlease check the error and try again.\n');
    }
  } finally {
    process.exit(0);
  }
}

createFirestoreDoc();
