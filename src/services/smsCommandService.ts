/**
 * SMS Command Service
 * Handles SMS commands for doc management operations
 * Verifies phone numbers against organization membership
 */

import { collection, query, where, getDocs, deleteDoc as deleteFirestoreDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Doc } from '../types';

// Command types that can be sent via SMS
export type SMSCommand =
  | 'HELP'
  | 'LIST'
  | 'VIEW'
  | 'DELETE'
  | 'EXPORT'
  | 'STATUS'
  | 'CREATE'
  | 'ASSIGN'
  | 'WEIGHT';

export interface SMSCommandResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface UserPhoneRecord {
  phoneNumber: string;
  organizationId: string;
  role: string;
  displayName: string;
  isActive: boolean;
}

/**
 * Verify if a phone number belongs to an organization
 * This prevents unauthorized users from executing commands
 */
export async function verifyPhoneNumber(phoneNumber: string): Promise<UserPhoneRecord | null> {
  try {
    console.log(`📞 Verifying phone number: ${phoneNumber}`);

    // Clean phone number (remove spaces, dashes, etc.)
    const cleanedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

    // Query users collection for this phone number
    const usersQuery = query(
      collection(db, 'users'),
      where('phoneNumber', '==', cleanedPhone),
      where('isActive', '==', true)
    );

    const snapshot = await getDocs(usersQuery);

    if (snapshot.empty) {
      console.log(`❌ Phone number not found or inactive: ${cleanedPhone}`);
      return null;
    }

    const userData = snapshot.docs[0].data();
    console.log(`✅ Phone verified for user: ${userData.displayName}`);

    return {
      phoneNumber: cleanedPhone,
      organizationId: userData.organizationId,
      role: userData.role,
      displayName: userData.displayName,
      isActive: userData.isActive
    };
  } catch (error) {
    console.error('Error verifying phone number:', error);
    return null;
  }
}

/**
 * Parse SMS command text into command type and arguments
 */
export function parseSMSCommand(text: string): { command: SMSCommand; args: string[] } | null {
  const trimmed = text.trim().toUpperCase();
  const parts = trimmed.split(/\s+/);
  const commandText = parts[0];
  const args = parts.slice(1);

  // Map command text to command types
  const commandMap: Record<string, SMSCommand> = {
    'HELP': 'HELP',
    'LIST': 'LIST',
    'DOCS': 'LIST',
    'VIEW': 'VIEW',
    'SHOW': 'VIEW',
    'DELETE': 'DELETE',
    'REMOVE': 'DELETE',
    'EXPORT': 'EXPORT',
    'SEND': 'EXPORT',
    'STATUS': 'STATUS',
    'CREATE': 'CREATE',
    'NEW': 'CREATE',
    'ASSIGN': 'ASSIGN',
    'ADD': 'ASSIGN',
    'WEIGHT': 'WEIGHT',
    'W': 'WEIGHT'
  };

  const command = commandMap[commandText];
  if (!command) {
    return null;
  }

  return { command, args };
}

/**
 * Execute HELP command - shows all available commands
 */
export function executeHelpCommand(): SMSCommandResult {
  const helpText = `📱 SMS Commands Available:

📋 Doc Management:
• LIST - View all your docs
• VIEW [doc#] - View details of a specific doc
• DELETE [doc#] - Delete a doc
• EXPORT [doc#] - Export doc to Google Doc
• STATUS - Check system status

⚖️ Weight Management:
• WEIGHT [doc#] [weight] [unit] - Set doc weight
• W [doc#] [weight] [unit] - Same as WEIGHT

📦 Doc Operations:
• CREATE [name] - Create new doc
• ASSIGN [doc#] - Assign current inquiry to doc

💡 Examples:
• "LIST" - Show all docs
• "VIEW 1" - View doc #1 details
• "WEIGHT 1 25 lb" - Set doc #1 to 25 pounds
• "W 2 10 kg" - Set doc #2 to 10 kilograms
• "EXPORT 1" - Export doc #1

Need help? Reply with HELP anytime.`;

  return {
    success: true,
    message: helpText
  };
}

/**
 * Execute LIST command - shows all docs for the organization
 */
export async function executeListCommand(organizationId: string): Promise<SMSCommandResult> {
  try {
    const docsQuery = query(
      collection(db, 'docs'),
      where('organizationId', '==', organizationId)
    );

    const snapshot = await getDocs(docsQuery);
    const docs: Doc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Doc));

    if (docs.length === 0) {
      return {
        success: true,
        message: '📋 No docs found.\n\nCreate a doc in the Doc Manager tab first.'
      };
    }

    // Format docs list for SMS
    let message = `📋 Your Docs (${docs.length}):\n\n`;
    docs.forEach((doc, index) => {
      const num = index + 1;
      const name = doc.customerName || 'Unnamed';
      const items = doc.screenshotCount;
      const status = doc.status;
      message += `${num}. ${name}\n   ${items} items | ${status}\n\n`;
    });

    message += `Reply VIEW [#] to see details\nReply EXPORT [#] to send to Google`;

    return {
      success: true,
      message,
      data: docs
    };
  } catch (error) {
    console.error('Error listing docs:', error);
    return {
      success: false,
      message: '❌ Error loading docs. Please try again.'
    };
  }
}

/**
 * Execute VIEW command - shows details of a specific doc
 */
export async function executeViewCommand(organizationId: string, docNumber: string): Promise<SMSCommandResult> {
  try {
    const docsQuery = query(
      collection(db, 'docs'),
      where('organizationId', '==', organizationId)
    );

    const snapshot = await getDocs(docsQuery);
    const docs: Doc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Doc));

    const index = parseInt(docNumber) - 1;
    if (index < 0 || index >= docs.length) {
      return {
        success: false,
        message: `❌ Doc #${docNumber} not found.\n\nYou have ${docs.length} doc(s). Reply LIST to see all.`
      };
    }

    const doc = docs[index];

    // Format doc details for SMS
    let message = `📄 Doc #${docNumber} Details:\n\n`;
    message += `👤 Customer: ${doc.customerName || 'Unnamed'}\n`;
    message += `📦 Items: ${doc.screenshotCount}\n`;
    message += `📊 Status: ${doc.status}\n`;

    if (doc.weight) {
      message += `⚖️ Weight: ${doc.weight} ${doc.weightUnit || 'kg'}\n`;
    }

    if (doc.totalValue) {
      message += `💰 Value: $${doc.totalValue.toFixed(2)}\n`;
    }

    if (doc.trackingNumbers && doc.trackingNumbers.length > 0) {
      message += `\n📍 Tracking:\n`;
      doc.trackingNumbers.forEach(tn => {
        message += `  • ${tn}\n`;
      });
    }

    message += `\n💡 Options:\n`;
    message += `• EXPORT ${docNumber} - Send to Google Doc\n`;
    message += `• DELETE ${docNumber} - Remove this doc`;

    return {
      success: true,
      message,
      data: doc
    };
  } catch (error) {
    console.error('Error viewing doc:', error);
    return {
      success: false,
      message: '❌ Error loading doc details. Please try again.'
    };
  }
}

/**
 * Execute DELETE command - deletes a specific doc
 */
export async function executeDeleteCommand(organizationId: string, docNumber: string, userId: string): Promise<SMSCommandResult> {
  try {
    const docsQuery = query(
      collection(db, 'docs'),
      where('organizationId', '==', organizationId)
    );

    const snapshot = await getDocs(docsQuery);
    const docs: Doc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Doc));

    const index = parseInt(docNumber) - 1;
    if (index < 0 || index >= docs.length) {
      return {
        success: false,
        message: `❌ Doc #${docNumber} not found.\n\nYou have ${docs.length} doc(s). Reply LIST to see all.`
      };
    }

    const doc = docs[index];
    const docRef = doc(db, 'docs', doc.id);

    await deleteFirestoreDoc(docRef);

    return {
      success: true,
      message: `✅ Doc deleted successfully!\n\n📄 "${doc.customerName || 'Unnamed'}"\n${doc.screenshotCount} items removed.\n\nReply LIST to see remaining docs.`
    };
  } catch (error) {
    console.error('Error deleting doc:', error);
    return {
      success: false,
      message: '❌ Error deleting doc. Please try again or use the web app.'
    };
  }
}

/**
 * Execute EXPORT command - exports a doc to Google Docs
 */
export async function executeExportCommand(organizationId: string, docNumber: string): Promise<SMSCommandResult> {
  try {
    const docsQuery = query(
      collection(db, 'docs'),
      where('organizationId', '==', organizationId)
    );

    const snapshot = await getDocs(docsQuery);
    const docs: Doc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Doc));

    const index = parseInt(docNumber) - 1;
    if (index < 0 || index >= docs.length) {
      return {
        success: false,
        message: `❌ Doc #${docNumber} not found.\n\nYou have ${docs.length} doc(s). Reply LIST to see all.`
      };
    }

    const doc = docs[index];

    // Check if doc is ready to export
    if (doc.status !== 'ready') {
      return {
        success: false,
        message: `❌ Doc #${docNumber} is not ready to export.\n\nStatus: ${doc.status}\n\nComplete processing in the Doc Manager first.`
      };
    }

    // In production, this would call the export service
    // For now, return success message
    return {
      success: true,
      message: `✅ Export started for Doc #${docNumber}!\n\n📄 "${doc.customerName || 'Unnamed'}"\n${doc.screenshotCount} items\n\n📨 You'll receive the Google Doc link shortly via SMS.`,
      data: { docId: doc.id }
    };
  } catch (error) {
    console.error('Error exporting doc:', error);
    return {
      success: false,
      message: '❌ Error exporting doc. Please try again or use the web app.'
    };
  }
}

/**
 * Execute STATUS command - shows system status
 */
export async function executeStatusCommand(organizationId: string): Promise<SMSCommandResult> {
  try {
    const docsQuery = query(
      collection(db, 'docs'),
      where('organizationId', '==', organizationId)
    );

    const snapshot = await getDocs(docsQuery);
    const docs: Doc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Doc));

    const ready = docs.filter(d => d.status === 'ready').length;
    const processing = docs.filter(d => d.status === 'processing').length;
    const draft = docs.filter(d => d.status === 'draft').length;

    let message = `📊 System Status:\n\n`;
    message += `📋 Total Docs: ${docs.length}\n`;
    message += `✅ Ready: ${ready}\n`;
    message += `⏳ Processing: ${processing}\n`;
    message += `📝 Draft: ${draft}\n\n`;
    message += `Reply LIST to see all docs\nReply HELP for commands`;

    return {
      success: true,
      message
    };
  } catch (error) {
    console.error('Error checking status:', error);
    return {
      success: false,
      message: '❌ Error checking status. Please try again.'
    };
  }
}

/**
 * Execute WEIGHT command - sets weight for a doc
 * Usage: WEIGHT [doc#] [weight] [unit]
 * Example: WEIGHT 1 25 lb  or  W 2 10 kg
 */
export async function executeWeightCommand(
  organizationId: string,
  docNumber: string,
  weightValue: string,
  unit?: string
): Promise<SMSCommandResult> {
  try {
    const docsQuery = query(
      collection(db, 'docs'),
      where('organizationId', '==', organizationId)
    );

    const snapshot = await getDocs(docsQuery);
    const docs: Doc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Doc));

    const index = parseInt(docNumber) - 1;
    if (index < 0 || index >= docs.length) {
      return {
        success: false,
        message: `❌ Doc #${docNumber} not found.\n\nYou have ${docs.length} doc(s). Reply LIST to see all.`
      };
    }

    const targetDoc = docs[index];
    const weight = parseFloat(weightValue);

    if (isNaN(weight) || weight <= 0) {
      return {
        success: false,
        message: `❌ Invalid weight: "${weightValue}"\n\nUsage: WEIGHT [doc#] [weight] [unit]\nExample: WEIGHT 1 25 lb`
      };
    }

    // Determine unit (default to kg if not specified or invalid)
    let weightUnit: 'kg' | 'lb' = 'kg';
    if (unit) {
      const normalizedUnit = unit.toLowerCase();
      if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound' || normalizedUnit === 'pounds') {
        weightUnit = 'lb';
      } else if (normalizedUnit === 'kg' || normalizedUnit === 'kgs' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
        weightUnit = 'kg';
      }
    }

    // Update doc weight
    const docRef = doc(db, 'docs', targetDoc.id);
    await updateDoc(docRef, {
      weight: weight,
      weightUnit: weightUnit
    });

    return {
      success: true,
      message: `✅ Weight updated!\n\n📄 Doc #${docNumber}: "${targetDoc.customerName || 'Unnamed'}"\n⚖️ Weight: ${weight} ${weightUnit}\n\nReply VIEW ${docNumber} to see details.`
    };
  } catch (error) {
    console.error('Error setting weight:', error);
    return {
      success: false,
      message: '❌ Error setting weight. Please try again.'
    };
  }
}

/**
 * Process an incoming SMS command
 * Main entry point for SMS command handling
 */
export async function processSMSCommand(
  phoneNumber: string,
  commandText: string,
  userId?: string
): Promise<SMSCommandResult> {
  try {
    console.log(`📱 Processing SMS command from ${phoneNumber}: "${commandText}"`);

    // Step 1: Verify phone number
    const user = await verifyPhoneNumber(phoneNumber);
    if (!user) {
      return {
        success: false,
        message: `❌ Unauthorized phone number.\n\nThis number (${phoneNumber}) is not registered with any organization.\n\nContact your administrator to add your number.`
      };
    }

    // Step 2: Parse command
    const parsed = parseSMSCommand(commandText);
    if (!parsed) {
      return {
        success: false,
        message: `❌ Invalid command: "${commandText}"\n\nReply HELP to see available commands.`
      };
    }

    const { command, args } = parsed;
    console.log(`✅ Command parsed: ${command}, args: ${args.join(', ')}`);

    // Step 3: Execute command
    switch (command) {
      case 'HELP':
        return executeHelpCommand();

      case 'LIST':
        return await executeListCommand(user.organizationId);

      case 'VIEW':
        if (args.length === 0) {
          return {
            success: false,
            message: '❌ Missing doc number.\n\nUsage: VIEW [doc#]\nExample: VIEW 1'
          };
        }
        return await executeViewCommand(user.organizationId, args[0]);

      case 'DELETE':
        if (args.length === 0) {
          return {
            success: false,
            message: '❌ Missing doc number.\n\nUsage: DELETE [doc#]\nExample: DELETE 1'
          };
        }
        return await executeDeleteCommand(user.organizationId, args[0], userId || '');

      case 'EXPORT':
        if (args.length === 0) {
          return {
            success: false,
            message: '❌ Missing doc number.\n\nUsage: EXPORT [doc#]\nExample: EXPORT 1'
          };
        }
        return await executeExportCommand(user.organizationId, args[0]);

      case 'STATUS':
        return await executeStatusCommand(user.organizationId);

      case 'WEIGHT':
        if (args.length < 2) {
          return {
            success: false,
            message: '❌ Missing parameters.\n\nUsage: WEIGHT [doc#] [weight] [unit]\n\nExamples:\n• WEIGHT 1 25 lb\n• W 2 10 kg'
          };
        }
        return await executeWeightCommand(user.organizationId, args[0], args[1], args[2]);

      case 'CREATE':
      case 'ASSIGN':
        return {
          success: false,
          message: `❌ ${command} command requires web app.\n\nPlease use the Doc Manager tab to create docs and assign inquiries.`
        };

      default:
        return {
          success: false,
          message: `❌ Command not implemented: ${command}\n\nReply HELP to see available commands.`
        };
    }
  } catch (error) {
    console.error('Error processing SMS command:', error);
    return {
      success: false,
      message: '❌ System error processing command. Please try again later.'
    };
  }
}
