/**
 * Fix User Organization - Add organization to existing admin user
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, Timestamp, collection } from 'firebase/firestore';
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

async function fixUserOrganization() {
  const userEmail = 'admin@importflow.com';

  console.log('\n=================================');
  console.log('📦 ImportFlow - Fix User Organization');
  console.log('=================================\n');

  try {
    // Find user by email
    console.log(`Looking up user: ${userEmail}...`);

    // Get all users and find by email (Firestore doesn't support querying by email directly in users collection)
    // We'll use a known UID or iterate
    // For now, let's assume we know the UID or we can get it from the auth state

    // Alternative: Get user UID from Auth (requires admin SDK or knowing the UID)
    // For this script, we'll search Firestore users collection

    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);

    let userDoc = null;
    let userId = null;

    usersSnapshot.forEach((doc) => {
      if (doc.data().email === userEmail) {
        userDoc = doc.data();
        userId = doc.id;
      }
    });

    if (!userDoc || !userId) {
      console.error(`❌ User ${userEmail} not found in Firestore`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${userDoc.displayName} (${userId})`);

    // Check if user already has an organization
    if (userDoc.organizationId) {
      console.log(`✅ User already has organization: ${userDoc.organizationId}`);

      // Verify organization exists
      const orgDoc = await getDoc(doc(db, 'organizations', userDoc.organizationId));
      if (orgDoc.exists()) {
        console.log(`✅ Organization exists and is linked`);
        console.log('\n✨ Everything is already set up correctly!');
        process.exit(0);
      } else {
        console.log(`⚠️  Organization document doesn't exist, creating it...`);
      }
    }

    // Create organization
    const now = new Date();
    const orgRef = doc(collection(db, 'organizations'));
    const organizationId = orgRef.id;

    const organizationData = {
      organizationName: userDoc.displayName || 'ImportFlow Organization',
      subscriptionStatus: 'trialing',
      subscriptionTier: 'professional',
      ownerId: userId,
      memberCount: 1,
      maxMembers: 10,
      billingEmail: userEmail,
      status: 'active',
      trialEndsAt: Timestamp.fromDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)), // 30 days trial
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      googleConnected: false
    };

    await setDoc(orgRef, organizationData);
    console.log(`✅ Created organization: ${organizationId}`);

    // Update user with organizationId
    await updateDoc(doc(db, 'users', userId), {
      organizationId: organizationId,
      role: 'organization-owner', // Update role to organization-owner
      updatedAt: Timestamp.fromDate(now)
    });

    console.log(`✅ Updated user with organizationId`);

    console.log('\n=================================');
    console.log('✨ Organization Setup Complete!');
    console.log('=================================');
    console.log(`Organization ID: ${organizationId}`);
    console.log(`Organization Name: ${organizationData.organizationName}`);
    console.log(`User: ${userEmail}`);
    console.log(`Role: organization-owner`);
    console.log(`Trial Ends: ${organizationData.trialEndsAt.toDate().toLocaleDateString()}`);
    console.log('\nYou can now use all features including Google Drive integration!');
    console.log('=================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing user organization:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Import getDocs
import { getDocs } from 'firebase/firestore';

fixUserOrganization();
