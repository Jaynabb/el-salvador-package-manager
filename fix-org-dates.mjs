import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';

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

async function fixOrganizationDates() {
  try {
    console.log('Signing in as admin...');
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

    console.log('\n🔧 Fixing organization subscription dates...\n');
    const orgsSnapshot = await getDocs(collection(db, 'organizations'));

    let fixedCount = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      const data = orgDoc.data();

      // Check if dates are missing
      if (!data.currentPeriodStart || !data.currentPeriodEnd) {
        console.log(`❌ Org ${data.organizationName} missing dates`);
        console.log(`   Setting subscription dates...`);

        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await updateDoc(doc(db, 'organizations', orgDoc.id), {
          currentPeriodStart: Timestamp.fromDate(now),
          currentPeriodEnd: Timestamp.fromDate(thirtyDaysFromNow),
          updatedAt: Timestamp.fromDate(now)
        });

        console.log(`   ✅ Fixed: ${data.organizationName}`);
        console.log(`      Period: ${now.toLocaleDateString()} - ${thirtyDaysFromNow.toLocaleDateString()}\n`);
        fixedCount++;
      } else {
        console.log(`✅ ${data.organizationName} already has dates set`);
      }
    }

    console.log(`\n✨ Done! Fixed ${fixedCount} organization(s).`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixOrganizationDates();
