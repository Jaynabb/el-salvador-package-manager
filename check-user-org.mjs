import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAh1nAKfnvNpd8Vml0I7-FLu-gdGiWiJ7M",
  authDomain: "el-salvador-package-manager.firebaseapp.com",
  projectId: "el-salvador-package-manager",
  storageBucket: "el-salvador-package-manager.firebasestorage.app",
  messagingSenderId: "49391304640",
  appId: "1:49391304640:web:59cfbe5205d02e76281225"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkUser(email) {
  console.log(`\n🔍 Checking user: ${email}`);
  console.log('='.repeat(60));

  try {
    // Find user by email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('❌ User not found in Firestore');
      return;
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    console.log('\n✅ User found:');
    console.log('  UID:', userDoc.id);
    console.log('  Email:', userData.email);
    console.log('  Display Name:', userData.displayName);
    console.log('  Role:', userData.role);
    console.log('  Organization ID:', userData.organizationId || '❌ NOT SET');
    console.log('  Status:', userData.status);

    // Check if organization exists
    if (userData.organizationId) {
      console.log('\n🏢 Checking organization...');
      const orgRef = doc(db, 'organizations', userData.organizationId);
      const orgSnap = await getDoc(orgRef);

      if (orgSnap.exists()) {
        const orgData = orgSnap.data();
        console.log('  ✅ Organization found:');
        console.log('    Name:', orgData.organizationName);
        console.log('    Owner ID:', orgData.ownerId);
        console.log('    Google Connected:', orgData.googleConnected || false);
        console.log('    Member Count:', orgData.memberCount);
        console.log('    Status:', orgData.subscriptionStatus);
      } else {
        console.log('  ❌ Organization NOT found (orphaned user!)');
      }
    } else {
      console.log('\n⚠️  User has NO organizationId - they cannot access any organization data!');
      console.log('   This is why exports are failing with "Missing or insufficient permissions"');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
}

// Check the user
await checkUser('notedmusicapp@gmail.com');

process.exit(0);
