/**
 * Link WhatsApp Phone Number to ImportFlow Account
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (uses Application Default Credentials)
try {
  admin.initializeApp({
    projectId: 'el-salvador-package-manager'
  });
} catch (error) {
  // Already initialized
  console.log('Firebase Admin already initialized');
}

const db = admin.firestore();

async function linkWhatsAppPhone() {
  const email = 'jamarijmcnabb@gmail.com';
  const whatsappPhone = 'whatsapp:+14072896614';

  try {
    console.log(`\n🔍 Looking for user: ${email}...`);

    // Find user by email
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.error(`❌ User not found: ${email}`);
      console.log('\nMake sure you have an account in ImportFlow first.');
      process.exit(1);
    }

    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();

    console.log(`✅ Found user: ${userData.displayName || email}`);
    console.log(`   Organization: ${userData.organizationId || 'None'}`);

    // Update user document with WhatsApp phone
    await db.collection('users').doc(userId).update({
      whatsappPhone: whatsappPhone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`\n✅ WhatsApp phone linked successfully!`);
    console.log(`   Phone: ${whatsappPhone}`);
    console.log(`\n📱 You can now send messages from WhatsApp!`);
    console.log(`\nNext steps:`);
    console.log(`1. Open WhatsApp on your phone`);
    console.log(`2. Send a message to: +1 (415) 523-8886`);
    console.log(`3. Test with: /help`);
    console.log(`\nHappy importing! 🚀\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

linkWhatsAppPhone();
