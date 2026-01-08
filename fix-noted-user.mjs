import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixUser() {
  const userId = 'Oovj34IYbXRuRsMX0RK8guoRPFr1';
  const email = 'notedmusicapp@gmail.com';

  console.log(`\n🔍 Checking user: ${email}`);
  console.log(`   UID: ${userId}`);
  console.log('='.repeat(60));

  try {
    // Get user document
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      console.log('❌ User document does NOT exist in Firestore!');
      console.log('   Firebase Auth account exists but no Firestore doc');
      console.log('   User needs to sign up through the app to create Firestore document');
      return;
    }

    const userData = userDoc.data();
    console.log('\n✅ User document found:');
    console.log('   Email:', userData.email);
    console.log('   Display Name:', userData.displayName || '(not set)');
    console.log('   Role:', userData.role);
    console.log('   Organization ID:', userData.organizationId || '❌ NOT SET');
    console.log('   Status:', userData.status);

    // Check organization
    if (userData.organizationId) {
      console.log('\n🏢 Checking organization:', userData.organizationId);
      const orgRef = doc(db, 'organizations', userData.organizationId);
      const orgDoc = await getDoc(orgRef);

      if (orgDoc.exists()) {
        const orgData = orgDoc.data();
        console.log('   ✅ Organization found:');
        console.log('      Name:', orgData.organizationName);
        console.log('      Owner ID:', orgData.ownerId);
        console.log('      Google Connected:', orgData.googleConnected || false);
        console.log('      Member Count:', orgData.memberCount);
        console.log('\n✅ User is properly set up - should be able to export!');
      } else {
        console.log('   ❌ Organization NOT found - orphaned user!');
        console.log('   Removing invalid organizationId from user...');

        await updateDoc(userRef, {
          organizationId: null,
          updatedAt: serverTimestamp()
        });

        console.log('   ✅ Cleared invalid organizationId');
      }
    } else {
      console.log('\n⚠️  NO ORGANIZATION ID');
      console.log('   This is why exports fail with "Missing or insufficient permissions"');
      console.log('   The Firestore security rules require users to have an organizationId');
      console.log('\n🔍 Searching for organizations owned by this user...');

      // Find organizations where this user is the owner
      const orgsRef = collection(db, 'organizations');
      const q = query(orgsRef, where('ownerId', '==', userId));
      const orgsSnapshot = await getDocs(q);

      if (!orgsSnapshot.empty) {
        const orgDoc = orgsSnapshot.docs[0];
        const orgData = orgDoc.data();
        console.log(`\n✅ Found organization owned by this user!`);
        console.log('   ID:', orgDoc.id);
        console.log('   Name:', orgData.organizationName);
        console.log('\n🔧 FIXING: Setting user.organizationId to', orgDoc.id);

        await updateDoc(userRef, {
          organizationId: orgDoc.id,
          updatedAt: serverTimestamp()
        });

        console.log('✅ FIXED! User now has organizationId set');
        console.log('   User should now be able to export orders');
      } else {
        console.log('❌ No organizations found for this user');
        console.log('   User needs to create an organization in the app (Organization tab)');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }

  console.log('\n' + '='.repeat(60));
  process.exit(0);
}

fixUser();
