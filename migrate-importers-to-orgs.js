/**
 * Migrate Importers to Organizations
 * This consolidates the legacy "importers" collection into "organizations"
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
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

// Admin credentials
const ADMIN_EMAIL = 'jay@tastybuilds.com';
const ADMIN_PASSWORD = 'Jaynabb94!';

async function migrateImportersToOrganizations() {
  console.log('\n=================================');
  console.log('📦 Migrating Importers to Organizations');
  console.log('=================================\n');

  try {
    // Sign in as admin first
    console.log('Signing in as admin...\n');
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log('✅ Signed in successfully\n');

    // Get all importers
    console.log('Step 1: Reading importers collection...\n');
    const importersSnapshot = await getDocs(collection(db, 'importers'));

    if (importersSnapshot.empty) {
      console.log('No importers found to migrate.');
      process.exit(0);
    }

    console.log(`Found ${importersSnapshot.size} importer(s)\n`);

    // Migrate each importer to organization
    let migratedCount = 0;

    for (const importerDoc of importersSnapshot.docs) {
      const importerData = importerDoc.data();
      const importerId = importerDoc.id;

      console.log(`Migrating: ${importerData.businessName || importerData.name || importerId}`);

      // Create organization document with same ID for consistency
      const organizationData = {
        // Core fields
        organizationName: importerData.businessName || importerData.name || 'Unnamed Importer',

        // Contact info from importer
        contactName: importerData.contactName || '',
        contactEmail: importerData.email || importerData.contactEmail || '',
        contactPhone: importerData.phone || importerData.contactPhone || '',
        address: importerData.address || '',

        // Subscription management (new fields)
        subscriptionStatus: 'active', // Set all existing importers as active
        subscriptionTier: 'professional',

        // Owner will need to be set manually or we can find users assigned to this importer
        ownerId: null, // TODO: Set this to the first admin user for this importer

        // Member management
        memberCount: 1, // Will be updated when we link users
        maxMembers: 10,

        // Billing
        billingEmail: importerData.email || importerData.contactEmail || '',

        // Status
        status: 'active',

        // Google integration
        googleConnected: importerData.googleConnected || false,
        googleAccessToken: importerData.googleAccessToken || null,
        googleRefreshToken: importerData.googleRefreshToken || null,
        googleTokenExpiry: importerData.googleTokenExpiry || null,

        // Legacy reference
        legacyImporterId: importerId,

        // Timestamps
        createdAt: importerData.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // Create organization with same ID as importer
      await setDoc(doc(db, 'organizations', importerId), organizationData);

      console.log(`  ✅ Created organization: ${organizationData.organizationName}`);
      migratedCount++;
    }

    console.log('\n=================================');
    console.log('✨ Migration Complete!');
    console.log('=================================');
    console.log(`Migrated ${migratedCount} importer(s) to organizations`);
    console.log('\nNext Steps:');
    console.log('1. Check Firestore to verify organizations were created');
    console.log('2. Update any users with importerId to use organizationId instead');
    console.log('3. Update packages/customers to reference organizationId');
    console.log('4. Once verified, you can delete the importers collection');
    console.log('=================================\n');

  } catch (error) {
    console.error('\n❌ Error during migration:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

migrateImportersToOrganizations();
