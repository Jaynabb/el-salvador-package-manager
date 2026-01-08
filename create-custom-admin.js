/**
 * Create Custom Admin Account
 * Edit the email and password below before running
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
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

// 🔧 EDIT THESE VALUES:
const ADMIN_EMAIL = 'jay@tastybuilds.com';  // <-- Change this
const ADMIN_PASSWORD = 'Jaynabb94!';     // <-- Change this
const ADMIN_NAME = 'Jay';               // <-- Change this

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createCustomAdmin() {
  console.log('\n=================================');
  console.log('📦 Creating Custom Admin');
  console.log('=================================\n');

  if (ADMIN_EMAIL === 'your-email@example.com') {
    console.log('❌ Please edit create-custom-admin.js and set your email/password first!');
    process.exit(1);
  }

  try {
    console.log(`Creating admin: ${ADMIN_EMAIL}\n`);

    const userCredential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    const uid = userCredential.user.uid;

    console.log('✅ User created in Firebase Auth');

    await setDoc(doc(db, 'users', uid), {
      email: ADMIN_EMAIL,
      displayName: ADMIN_NAME,
      role: 'master-admin',
      organizationId: null,
      status: 'active',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    console.log('✅ User document created in Firestore');
    console.log('\n=================================');
    console.log('✨ Admin Account Created!');
    console.log('=================================');
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log(`Name: ${ADMIN_NAME}`);
    console.log('\nYou can now log in at: https://importflow-app.web.app');
    console.log('=================================\n');

  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log(`\n❌ Email ${ADMIN_EMAIL} is already in use.`);
      console.log('Either delete that user in Firebase Console or choose a different email.');
    } else {
      console.error('\n❌ Error:', error.message);
    }
  } finally {
    process.exit(0);
  }
}

createCustomAdmin();
