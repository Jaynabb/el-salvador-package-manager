const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixUser() {
  const userId = 'Oovj34IYbXRuRsMX0RK8guoRPFr1';
  const email = 'notedmusicapp@gmail.com';

  console.log(`\n🔍 Checking user: ${email}`);
  console.log(`   UID: ${userId}`);
  console.log('='.repeat(60));

  try {
    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log('❌ User document does NOT exist in Firestore!');
      console.log('   This is the problem - Firebase Auth account exists but no Firestore doc');
      console.log('\n📝 Would you like to create the user document? (This script needs to be updated)');
      return;
    }

    const userData = userDoc.data();
    console.log('\n✅ User document found:');
    console.log('   Email:', userData.email);
    console.log('   Display Name:', userData.displayName ||'(not set)');
    console.log('   Role:', userData.role);
    console.log('   Organization ID:', userData.organizationId || '❌ NOT SET');
    console.log('   Status:', userData.status);

    // Check organization
    if (userData.organizationId) {
      console.log('\n🏢 Checking organization:', userData.organizationId);
      const orgRef = db.collection('organizations').doc(userData.organizationId);
      const orgDoc = await orgRef.get();

      if (orgDoc.exists) {
        const orgData = orgDoc.data();
        console.log('   ✅ Organization found:');
        console.log('      Name:', orgData.organizationName);
        console.log('      Owner ID:', orgData.ownerId);
        console.log('      Google Connected:', orgData.googleConnected || false);
        console.log('      Member Count:', orgData.memberCount);
      } else {
        console.log('   ❌ Organization NOT found - orphaned user!');
      }
    } else {
      console.log('\n⚠️  NO ORGANIZATION ID - Finding organizations...');

      // Find organizations where this user is the owner
      const orgsSnapshot = await db.collection('organizations')
        .where('ownerId', '==', userId)
        .get();

      if (!orgsSnapshot.empty) {
        const org = orgsSnapshot.docs[0];
        const orgData = org.data();
        console.log(`\n✅ Found organization owned by this user: ${org.id}`);
        console.log('   Name:', orgData.organizationName);
        console.log('\n🔧 FIXING: Setting user.organizationId to', org.id);

        await userRef.update({
          organizationId: org.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ FIXED! User now has organizationId set');
      } else {
        console.log('❌ No organizations found for this user');
        console.log('   User needs to create an organization or be added to one');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  process.exit(0);
}

fixUser();
