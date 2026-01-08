/**
 * Quick script to create a test user for immediate access
 * Run with: node create-test-user.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function createTestUser() {
  const email = 'test@importer.com';
  const password = 'test123456';
  const displayName = 'Test Importer';

  try {
    // Create auth user
    console.log('Creating Firebase Auth user...');
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true
    });

    console.log(`✅ Auth user created: ${userRecord.uid}`);

    // Create user document in Firestore
    console.log('Creating Firestore user document...');
    await db.collection('users').doc(userRecord.uid).set({
      email,
      displayName,
      role: 'importer-admin',
      organizationId: 'test-org-001',
      status: 'active',
      phoneNumber: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create test organization
    console.log('Creating test organization...');
    await db.collection('organizations').doc('test-org-001').set({
      organizationName: 'Test Import Company',
      subscriptionStatus: 'active',
      subscriptionTier: 'professional',
      ownerId: userRecord.uid,
      memberCount: 1,
      maxMembers: 5,
      billingEmail: email,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('\n✅ Test user created successfully!');
    console.log('\n📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('\nYou can now login with these credentials.');

  } catch (error) {
    console.error('❌ Error creating user:', error);
  } finally {
    process.exit();
  }
}

createTestUser();
