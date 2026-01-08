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

async function checkAllUsers() {
  try {
    console.log('Signing in as admin...');
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

    console.log('\n📋 All Users:\n');
    const usersSnapshot = await getDocs(collection(db, 'users'));

    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Email: ${data.email}`);
      console.log(`  Name: ${data.displayName}`);
      console.log(`  Role: ${data.role}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Org ID: ${data.organizationId || 'N/A'}`);
      console.log(`  Created: ${data.createdAt?.toDate?.()?.toLocaleString() || 'N/A'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllUsers();
