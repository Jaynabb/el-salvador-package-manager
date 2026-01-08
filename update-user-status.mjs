import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';

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

async function fixUserStatus() {
  try {
    console.log('Signing in as admin...');
    const userCred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    const uid = userCred.user.uid;
    
    console.log('User ID:', uid);
    
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      console.log('Current status:', userSnap.data().status);
      
      await updateDoc(userRef, {
        status: 'active'
      });
      
      console.log('✅ User status updated to active!');
    } else {
      console.log('❌ User document not found!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixUserStatus();
