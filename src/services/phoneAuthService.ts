/**
 * Phone Number Authentication & Organization Verification Service
 *
 * SECURITY: Blocks commands from phone numbers not linked to an organization
 * Importers must be registered before they can use SMS commands
 */

import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface PhoneAuth {
  phoneNumber: string;
  organizationId: string;
  userId?: string;
  displayName?: string;
  role?: string;
  active: boolean;
  createdAt: Date;
  lastUsed?: Date;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  active: boolean;
  allowedPhoneNumbers: string[];
}

/**
 * Verify if a phone number is authorized to use commands
 *
 * SECURITY CHECK:
 * 1. Check if phone number exists in phoneAuth collection
 * 2. Check if organizationId is active
 * 3. Check if user is active
 * 4. Return organization info if authorized, null if blocked
 *
 * @param phoneNumber - Phone number in E.164 format (+15035551234)
 * @returns OrganizationInfo if authorized, null if blocked
 */
export async function verifyPhoneNumber(phoneNumber: string): Promise<{
  authorized: boolean;
  organizationId?: string;
  organizationName?: string;
  userId?: string;
  displayName?: string;
  role?: string;
  message: string;
}> {
  try {
    // Normalize phone number (remove spaces, ensure + prefix)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    console.log(`🔐 Verifying phone number: ${normalizedPhone}`);

    // Check if phone number is registered
    const phoneAuthRef = collection(db, 'phoneAuth');
    const phoneQuery = query(phoneAuthRef, where('phoneNumber', '==', normalizedPhone));
    const phoneSnapshot = await getDocs(phoneQuery);

    if (phoneSnapshot.empty) {
      console.warn(`❌ Unauthorized phone number: ${normalizedPhone}`);
      return {
        authorized: false,
        message: `⛔ *Unauthorized Access*

This phone number (${phoneNumber}) is not registered with ImportFlow.

To get access:
1. Contact your organization admin
2. Have them add your phone number in Settings
3. Try again

*Need help?* Contact ImportFlow support.`
      };
    }

    const phoneAuthData = phoneSnapshot.docs[0].data() as PhoneAuth;

    // Check if user is active
    if (!phoneAuthData.active) {
      console.warn(`❌ Inactive account: ${normalizedPhone}`);
      return {
        authorized: false,
        message: `⛔ *Account Inactive*

Your account has been deactivated.

Contact your organization admin for assistance.`
      };
    }

    // Get organization info
    const orgRef = doc(db, 'organizations', phoneAuthData.organizationId);
    const orgDoc = await getDoc(orgRef);

    if (!orgDoc.exists()) {
      console.warn(`❌ Organization not found: ${phoneAuthData.organizationId}`);
      return {
        authorized: false,
        message: `⛔ *Organization Not Found*

Your organization could not be found.

Contact ImportFlow support.`
      };
    }

    const orgData = orgDoc.data();

    // Check if organization is active
    if (!orgData.active) {
      console.warn(`❌ Inactive organization: ${phoneAuthData.organizationId}`);
      return {
        authorized: false,
        message: `⛔ *Organization Inactive*

Your organization account has been deactivated.

Contact ImportFlow support for assistance.`
      };
    }

    // Update last used timestamp
    // await updateDoc(phoneSnapshot.docs[0].ref, {
    //   lastUsed: Timestamp.fromDate(new Date())
    // });

    console.log(`✓ Authorized: ${normalizedPhone} (${orgData.name})`);

    return {
      authorized: true,
      organizationId: phoneAuthData.organizationId,
      organizationName: orgData.name,
      userId: phoneAuthData.userId,
      displayName: phoneAuthData.displayName,
      role: phoneAuthData.role,
      message: 'Authorized'
    };
  } catch (error) {
    console.error('Error verifying phone number:', error);
    return {
      authorized: false,
      message: `❌ *Verification Error*

Could not verify your phone number.

Please try again later or contact support.`
    };
  }
}

/**
 * Normalize phone number to E.164 format
 * Examples:
 * - "+1 (503) 555-1234" -> "+15035551234"
 * - "503-555-1234" -> "+15035551234" (assumes US)
 * - "+503 7845-1234" -> "+50378451234" (El Salvador)
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters except +
  let normalized = phoneNumber.replace(/[^\d+]/g, '');

  // If doesn't start with +, assume US number
  if (!normalized.startsWith('+')) {
    // If starts with 1, add +
    if (normalized.startsWith('1')) {
      normalized = '+' + normalized;
    } else {
      // Add +1 for US
      normalized = '+1' + normalized;
    }
  }

  return normalized;
}

/**
 * Get all batches for an organization
 * Used by /list command
 */
export async function getOrganizationBatches(organizationId: string): Promise<any[]> {
  try {
    const batchesRef = collection(db, 'batches');
    const batchesQuery = query(
      batchesRef,
      where('organizationId', '==', organizationId)
    );
    const snapshot = await getDocs(batchesQuery);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate()
    }));
  } catch (error) {
    console.error('Error getting organization batches:', error);
    return [];
  }
}

/**
 * Verify batch access
 * Ensures phone number's organization owns the batch
 *
 * @param batchId - Batch ID
 * @param organizationId - Organization ID from phone verification
 * @returns true if authorized, false if blocked
 */
export async function verifyBatchAccess(
  batchId: string,
  organizationId: string
): Promise<{ authorized: boolean; message: string; batch?: any }> {
  try {
    const batchRef = doc(db, 'batches', batchId);
    const batchDoc = await getDoc(batchRef);

    if (!batchDoc.exists()) {
      return {
        authorized: false,
        message: `❌ Batch "${batchId}" not found.`
      };
    }

    const batchData = batchDoc.data();

    // Check if batch belongs to user's organization
    if (batchData.organizationId !== organizationId) {
      console.warn(`⛔ Access denied: Batch ${batchId} belongs to different organization`);
      return {
        authorized: false,
        message: `⛔ *Access Denied*

Batch "${batchId}" does not belong to your organization.

You can only access batches owned by your organization.`
      };
    }

    return {
      authorized: true,
      message: 'Authorized',
      batch: {
        id: batchDoc.id,
        ...batchData,
        createdAt: batchData.createdAt?.toDate(),
        updatedAt: batchData.updatedAt?.toDate()
      }
    };
  } catch (error) {
    console.error('Error verifying batch access:', error);
    return {
      authorized: false,
      message: `❌ Error verifying access to batch.`
    };
  }
}

/**
 * Format unauthorized access message
 * Displayed to users who try to use SMS commands without registration
 */
export function getUnauthorizedMessage(phoneNumber: string): string {
  return `⛔ *Unauthorized Access*

This phone number (${phoneNumber}) is not registered with ImportFlow.

*To get SMS access:*
1. Ask your organization admin to add your phone number
2. Admin goes to Settings > SMS Access
3. Admin adds your number and assigns your role
4. You'll receive a confirmation SMS
5. Try your command again!

*Need help?* Contact ImportFlow support.`;
}

/**
 * Format batch list message
 */
export function formatBatchListMessage(batches: any[]): string {
  if (batches.length === 0) {
    return `📦 *Your Batches*

You don't have any batches yet.

Create one with:
/create "Batch Name"

Example:
/create "December Shipment"`;
  }

  let message = `📦 *Your Batches* (${batches.length} total)\n\n`;

  batches.forEach((batch, index) => {
    const statusEmoji = {
      'draft': '📝',
      'processing': '⏳',
      'ready': '✅',
      'exported': '📄',
      'error': '❌'
    }[batch.status] || '📦';

    message += `${index + 1}. ${statusEmoji} *${batch.customerName || batch.id}*\n`;
    message += `   ID: ${batch.id}\n`;
    message += `   Status: ${batch.status}\n`;
    message += `   Screenshots: ${batch.screenshotCount || 0}\n`;
    if (batch.weight) {
      message += `   Weight: ${batch.weight}${batch.weightUnit}\n`;
    }
    message += `\n`;
  });

  message += `---\nUse /status [batch-id] to see details.`;

  return message;
}

/**
 * Format user info message
 */
export function formatUserInfoMessage(authInfo: {
  phoneNumber: string;
  organizationName?: string;
  displayName?: string;
  role?: string;
}): string {
  return `👤 *Your Account Info*

Name: ${authInfo.displayName || 'Not set'}
Phone: ${authInfo.phoneNumber}
Organization: ${authInfo.organizationName || 'Unknown'}
Role: ${authInfo.role || 'User'}

---
Use /list to see your batches.
Use /help to see all commands.`;
}
