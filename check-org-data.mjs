import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAh1nAKfnvNpd8Vml0I7-FLu-gdGiWiJ7M",
  authDomain: "el-salvador-package-manager.firebaseapp.com",
  projectId: "el-salvador-package-manager",
  storageBucket: "el-salvador-package-manager.firebasestorage.app",
  messagingSenderId: "1071089833140",
  appId: "1:1071089833140:web:abc123"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = 'jay@tastybuilds.com';
const ADMIN_PASSWORD = 'Jaynabb94!';

async function checkOrganizations() {
  try {
    console.log('Signing in as admin...');
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

    console.log('\n📋 All Organizations:\n');
    const orgsSnapshot = await getDocs(collection(db, 'organizations'));

    orgsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Organization ID: ${doc.id}`);
      console.log(`  Name: ${data.organizationName}`);
      console.log(`  Owner ID: ${data.ownerId}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Subscription Status: ${data.subscriptionStatus}`);
      console.log(`  Subscription Tier: ${data.subscriptionTier}`);
      console.log(`  Member Count: ${data.memberCount}`);
      console.log(`  Max Members: ${data.maxMembers}`);
      console.log(`  Current Period Start: ${data.currentPeriodStart?.toDate?.()?.toLocaleString() || 'NOT SET'}`);
      console.log(`  Current Period End: ${data.currentPeriodEnd?.toDate?.()?.toLocaleString() || 'NOT SET'}`);
      console.log(`  Google Connected: ${data.googleConnected || false}`);
      console.log(`  Google Email: ${data.googleEmail || 'N/A'}`);
      console.log(`  Created: ${data.createdAt?.toDate?.()?.toLocaleString() || 'N/A'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrganizations();
