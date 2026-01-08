/**
 * Script to list all organizations with their IDs
 *
 * Usage: node list-organizations.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function listOrganizations() {
  try {
    console.log('📋 Fetching all organizations...\n');

    const orgsSnapshot = await db.collection('organizations').get();

    if (orgsSnapshot.empty) {
      console.log('❌ No organizations found');
      process.exit(0);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ORGANIZATIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    orgsSnapshot.forEach(doc => {
      const org = doc.data();
      console.log('🏢 Organization:', org.organizationName);
      console.log('   ID:', doc.id);
      console.log('   Status:', org.status);
      console.log('   Subscription:', org.subscriptionStatus);
      console.log('   Members:', org.memberCount || 0);
      console.log('   Google Connected:', org.googleConnected ? '✓' : '✗');
      if (org.contactEmail) {
        console.log('   Contact:', org.contactEmail);
      }
      console.log();
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total: ${orgsSnapshot.size} organization(s)\n`);

  } catch (error) {
    console.error('❌ Error listing organizations:', error.message);
  } finally {
    process.exit();
  }
}

listOrganizations();
