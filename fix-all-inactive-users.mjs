import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

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

async function fixAllInactiveUsers() {
  try {
    console.log('Signing in as admin...');
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

    console.log('\n🔍 Checking all users...\n');
    const usersSnapshot = await getDocs(collection(db, 'users'));

    let fixedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();

      if (data.status === 'inactive') {
        console.log(`❌ Found inactive user: ${data.email}`);
        console.log(`   Updating to active...`);

        await updateDoc(doc(db, 'users', userDoc.id), {
          status: 'active'
        });

        console.log(`   ✅ Fixed: ${data.email}\n`);
        fixedCount++;
      } else {
        console.log(`✅ Already active: ${data.email}`);
      }
    }

    console.log(`\n✨ Done! Fixed ${fixedCount} inactive user(s).`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAllInactiveUsers();
