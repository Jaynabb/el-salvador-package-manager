/**
 * Script to add a tester to an existing organization
 *
 * Usage:
 *   node create-tester.js tester@example.com "Tester Name" password123 organizationId
 *
 * Example:
 *   node create-tester.js john@test.com "John Doe" testpass123 Qf5pmord7LbwQSFK3cYv
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function createTester() {
  // Get command line arguments
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('❌ Missing arguments!');
    console.log('\nUsage:');
    console.log('  node create-tester.js <email> <displayName> <password> [organizationId] [role]');
    console.log('\nExamples:');
    console.log('  node create-tester.js john@test.com "John Doe" testpass123');
    console.log('  node create-tester.js jane@test.com "Jane Smith" testpass123 Qf5pmord7LbwQSFK3cYv');
    console.log('  node create-tester.js admin@test.com "Admin User" testpass123 Qf5pmord7LbwQSFK3cYv organization-owner');
    console.log('\nRoles:');
    console.log('  - organization-member (default)');
    console.log('  - organization-owner');
    console.log('  - master-admin');
    process.exit(1);
  }

  const email = args[0];
  const displayName = args[1];
  const password = args[2];
  const organizationId = args[3] || null; // Optional
  const role = args[4] || 'organization-member'; // Default to member

  // Validate email
  if (!email.includes('@')) {
    console.log('❌ Invalid email format');
    process.exit(1);
  }

  // Validate password
  if (password.length < 6) {
    console.log('❌ Password must be at least 6 characters');
    process.exit(1);
  }

  try {
    console.log('🔧 Creating tester account...\n');
    console.log('📧 Email:', email);
    console.log('👤 Name:', displayName);
    console.log('🔑 Password:', password);
    console.log('🏢 Organization ID:', organizationId || 'None (master-admin)');
    console.log('👔 Role:', role);
    console.log();

    // Check if organization exists (if provided)
    if (organizationId) {
      console.log('🔍 Checking organization...');
      const orgDoc = await db.collection('organizations').doc(organizationId).get();

      if (!orgDoc.exists) {
        console.log('❌ Organization not found:', organizationId);
        console.log('\nTo find your organization ID:');
        console.log('1. Log in as master admin');
        console.log('2. Go to Master Admin dashboard');
        console.log('3. Click on an organization to see its ID');
        process.exit(1);
      }

      const orgData = orgDoc.data();
      console.log('✓ Found organization:', orgData.organizationName);
      console.log();
    }

    // Create Firebase Auth user
    console.log('📝 Creating Firebase Auth user...');
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true // Skip email verification for testers
    });

    console.log('✓ Auth user created:', userRecord.uid);

    // Create Firestore user document
    console.log('📝 Creating Firestore user document...');
    await db.collection('users').doc(userRecord.uid).set({
      email,
      displayName,
      role: role,
      organizationId: organizationId,
      status: 'active',
      requirePasswordChange: false, // Don't force password change for testers
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✓ User document created');

    // Update organization member count if applicable
    if (organizationId && (role === 'organization-member' || role === 'organization-owner')) {
      console.log('📝 Updating organization member count...');
      const orgRef = db.collection('organizations').doc(organizationId);
      await orgRef.update({
        memberCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✓ Organization updated');
    }

    console.log('\n✅ Tester account created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 LOGIN CREDENTIALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('App URL: https://importflow-app.web.app');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Send these credentials to the tester via email or secure message.');
    console.log('They can log in immediately without email verification.\n');

  } catch (error) {
    console.error('\n❌ Error creating tester:', error.message);

    if (error.code === 'auth/email-already-exists') {
      console.log('\n💡 This email is already registered.');
      console.log('   If you need to reset their password, use Firebase Console:');
      console.log('   https://console.firebase.google.com/project/el-salvador-package-manager/authentication/users');
    }
  } finally {
    process.exit();
  }
}

createTester();
