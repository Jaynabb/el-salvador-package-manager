/**
 * COMPLETE SMS WEBHOOK HANDLER
 *
 * Full web app parity - importers can do EVERYTHING via SMS!
 * Includes organization verification - blocks unauthorized phone numbers
 *
 * This is production-ready code for Firebase Cloud Functions, Vercel, or Express
 */

import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Batch, Screenshot } from '../types';
import { parseCommand, getHelpMessage, getBatchStatusMessage, getUnknownCommandMessage } from './whatsappCommandService';
import { exportAndDeliverBatch } from './batchExportService';
import {
  verifyPhoneNumber,
  verifyBatchAccess,
  getOrganizationBatches,
  formatBatchListMessage,
  formatUserInfoMessage
} from './phoneAuthService';
import { getBatchByIdAndPhone, getScreenshotsByBatchId } from './firestoreClient';

/**
 * MAIN SMS PROCESSOR
 *
 * This processes ALL SMS commands with full organization verification
 *
 * SECURITY:
 * 1. Verifies phone number is registered
 * 2. Verifies organization is active
 * 3. Verifies batch access for batch-specific commands
 * 4. Blocks unauthorized access
 */
export async function processCompleteSMS(
  from: string,      // Phone number
  body: string       // Message text
): Promise<{ reply: string; success: boolean }> {
  console.log(`📱 SMS from ${from}: ${body}`);

  // Parse command
  const command = parseCommand(body, from, 'sms');

  // SECURITY CHECK: Verify phone number authorization
  // (Skip for help command - anyone can ask for help)
  if (command.type !== 'help') {
    const authCheck = await verifyPhoneNumber(from);

    if (!authCheck.authorized) {
      console.warn(`⛔ Unauthorized: ${from}`);
      return {
        reply: authCheck.message,
        success: false
      };
    }

    // Store auth info for later use
    const organizationId = authCheck.organizationId!;
    const organizationName = authCheck.organizationName!;

    // Process authenticated commands
    return await processAuthenticatedCommand(command, organizationId, organizationName, authCheck);
  }

  // Help command (no auth required)
  if (command.type === 'help') {
    return {
      reply: getHelpMessage('sms'),
      success: true
    };
  }

  // Unknown command
  return {
    reply: getUnknownCommandMessage(),
    success: false
  };
}

/**
 * Process commands from authenticated users
 */
async function processAuthenticatedCommand(
  command: any,
  organizationId: string,
  organizationName: string,
  authInfo: any
): Promise<{ reply: string; success: boolean }> {
  try {
    // CREATE BATCH
    if (command.type === 'create') {
      return await handleCreateBatch(command, organizationId);
    }

    // DELETE BATCH
    if (command.type === 'delete') {
      return await handleDeleteBatch(command, organizationId);
    }

    // RENAME BATCH
    if (command.type === 'rename') {
      return await handleRenameBatch(command, organizationId);
    }

    // SET WEIGHT
    if (command.type === 'setweight') {
      return await handleSetWeight(command, organizationId);
    }

    // LIST BATCHES
    if (command.type === 'list') {
      return await handleListBatches(organizationId);
    }

    // MY INFO
    if (command.type === 'myinfo') {
      return {
        reply: formatUserInfoMessage({
          phoneNumber: command.phoneNumber,
          organizationName,
          displayName: authInfo.displayName,
          role: authInfo.role
        }),
        success: true
      };
    }

    // STATUS
    if (command.type === 'status') {
      return await handleStatus(command, organizationId);
    }

    // SCREENSHOTS
    if (command.type === 'screenshots') {
      return await handleListScreenshots(command, organizationId);
    }

    // EXPORT
    if (command.type === 'export') {
      return await handleExport(command, organizationId);
    }

    // Unknown
    return {
      reply: getUnknownCommandMessage(),
      success: false
    };
  } catch (error) {
    console.error('Error processing command:', error);
    return {
      reply: `❌ Error processing command. Please try again or contact support.`,
      success: false
    };
  }
}

/**
 * CREATE BATCH
 * /create "Batch Name"
 */
async function handleCreateBatch(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    const batchRef = collection(db, 'batches');
    const newBatch = {
      customerName: command.batchName,
      organizationId,
      phoneNumber: command.phoneNumber,
      status: 'draft',
      screenshotCount: 0,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date())
    };

    const docRef = await addDoc(batchRef, newBatch);

    return {
      reply: `✅ *Batch Created!*

Name: ${command.batchName}
ID: ${docRef.id}
Status: draft

Add screenshots via WhatsApp or web, then use:
/export ${docRef.id}`,
      success: true
    };
  } catch (error) {
    console.error('Error creating batch:', error);
    return {
      reply: `❌ Failed to create batch. Please try again.`,
      success: false
    };
  }
}

/**
 * DELETE BATCH
 * /delete batch-id
 */
async function handleDeleteBatch(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    // Verify access
    const accessCheck = await verifyBatchAccess(command.batchId!, organizationId);
    if (!accessCheck.authorized) {
      return {
        reply: accessCheck.message,
        success: false
      };
    }

    // Delete batch
    const batchRef = doc(db, 'batches', command.batchId!);
    await deleteDoc(batchRef);

    return {
      reply: `✅ Batch "${accessCheck.batch?.customerName || command.batchId}" deleted successfully.`,
      success: true
    };
  } catch (error) {
    console.error('Error deleting batch:', error);
    return {
      reply: `❌ Failed to delete batch. Please try again.`,
      success: false
    };
  }
}

/**
 * RENAME BATCH
 * /rename batch-id "New Name"
 */
async function handleRenameBatch(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    // Verify access
    const accessCheck = await verifyBatchAccess(command.batchId!, organizationId);
    if (!accessCheck.authorized) {
      return {
        reply: accessCheck.message,
        success: false
      };
    }

    // Update batch name
    const batchRef = doc(db, 'batches', command.batchId!);
    await updateDoc(batchRef, {
      customerName: command.batchName,
      updatedAt: Timestamp.fromDate(new Date())
    });

    return {
      reply: `✅ Batch renamed to "${command.batchName}"`,
      success: true
    };
  } catch (error) {
    console.error('Error renaming batch:', error);
    return {
      reply: `❌ Failed to rename batch. Please try again.`,
      success: false
    };
  }
}

/**
 * SET WEIGHT
 * /setweight batch-id 10kg
 */
async function handleSetWeight(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    // Verify access
    const accessCheck = await verifyBatchAccess(command.batchId!, organizationId);
    if (!accessCheck.authorized) {
      return {
        reply: accessCheck.message,
        success: false
      };
    }

    // Update weight
    const batchRef = doc(db, 'batches', command.batchId!);
    await updateDoc(batchRef, {
      weight: command.weight,
      weightUnit: command.weightUnit,
      updatedAt: Timestamp.fromDate(new Date())
    });

    return {
      reply: `✅ Weight set to ${command.weight}${command.weightUnit} for batch "${accessCheck.batch?.customerName || command.batchId}"`,
      success: true
    };
  } catch (error) {
    console.error('Error setting weight:', error);
    return {
      reply: `❌ Failed to set weight. Please try again.`,
      success: false
    };
  }
}

/**
 * LIST BATCHES
 * /list or /batches
 */
async function handleListBatches(
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    const batches = await getOrganizationBatches(organizationId);
    return {
      reply: formatBatchListMessage(batches),
      success: true
    };
  } catch (error) {
    console.error('Error listing batches:', error);
    return {
      reply: `❌ Failed to load batches. Please try again.`,
      success: false
    };
  }
}

/**
 * STATUS
 * /status batch-id
 */
async function handleStatus(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    // Verify access
    const accessCheck = await verifyBatchAccess(command.batchId!, organizationId);
    if (!accessCheck.authorized) {
      return {
        reply: accessCheck.message,
        success: false
      };
    }

    // Get screenshots count
    const screenshots = await getScreenshotsByBatchId(command.batchId!);
    const batchWithCount = {
      ...accessCheck.batch,
      screenshotCount: screenshots.length
    };

    return {
      reply: getBatchStatusMessage(batchWithCount),
      success: true
    };
  } catch (error) {
    console.error('Error getting status:', error);
    return {
      reply: `❌ Failed to get batch status. Please try again.`,
      success: false
    };
  }
}

/**
 * LIST SCREENSHOTS
 * /screenshots batch-id
 */
async function handleListScreenshots(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    // Verify access
    const accessCheck = await verifyBatchAccess(command.batchId!, organizationId);
    if (!accessCheck.authorized) {
      return {
        reply: accessCheck.message,
        success: false
      };
    }

    const screenshots = await getScreenshotsByBatchId(command.batchId!);

    if (screenshots.length === 0) {
      return {
        reply: `📸 No screenshots in batch "${accessCheck.batch?.customerName || command.batchId}"

Add screenshots via:
- WhatsApp (send images)
- Web app (ImportFlow Inquiries)`,
        success: true
      };
    }

    let message = `📸 *Screenshots in "${accessCheck.batch?.customerName || command.batchId}"*\n\n`;
    message += `Total: ${screenshots.length}\n\n`;

    screenshots.forEach((screenshot: any, index: number) => {
      const statusEmoji = {
        'pending': '⏳',
        'processing': '🔄',
        'completed': '✅',
        'error': '❌'
      }[screenshot.extractionStatus || 'pending'] || '📷';

      message += `${index + 1}. ${statusEmoji} ${screenshot.source === 'whatsapp' ? '📱' : '💻'}\n`;
      message += `   Status: ${screenshot.extractionStatus || 'pending'}\n`;
      if (screenshot.extractedData?.trackingNumber) {
        message += `   Tracking: ${screenshot.extractedData.trackingNumber}\n`;
      }
      message += `\n`;
    });

    return {
      reply: message,
      success: true
    };
  } catch (error) {
    console.error('Error listing screenshots:', error);
    return {
      reply: `❌ Failed to load screenshots. Please try again.`,
      success: false
    };
  }
}

/**
 * EXPORT
 * /export batch-id
 * /export batch-id email:user@example.com
 */
async function handleExport(
  command: any,
  organizationId: string
): Promise<{ reply: string; success: boolean }> {
  try {
    // Verify access
    const accessCheck = await verifyBatchAccess(command.batchId!, organizationId);
    if (!accessCheck.authorized) {
      return {
        reply: accessCheck.message,
        success: false
      };
    }

    const batch = accessCheck.batch;
    const screenshots = await getScreenshotsByBatchId(command.batchId!);

    if (screenshots.length === 0) {
      return {
        reply: `❌ Cannot export: Batch has no screenshots.

Add screenshots first via WhatsApp or web.`,
        success: false
      };
    }

    if (batch.status !== 'ready') {
      return {
        reply: `⚠️ Batch not ready for export.

Current status: ${batch.status}

Ensure all screenshots are processed first.`,
        success: false
      };
    }

    // Export!
    const exportResult = await exportAndDeliverBatch(
      batch,
      screenshots,
      command.deliveryMethod || 'sms',
      command.email || command.phoneNumber
    );

    if (!exportResult.success) {
      return {
        reply: `❌ Export failed: ${exportResult.message}`,
        success: false
      };
    }

    // Success message
    if (command.email) {
      return {
        reply: `✅ *Batch Exported!*

📧 Sent to: ${command.email}

📄 Document: ${exportResult.documentUrl}
📊 Spreadsheet: ${exportResult.sheetUrl || 'Processing...'}

Check your email for customs documents.`,
        success: true
      };
    } else {
      return {
        reply: `✅ *Batch Export Ready*

📦 Batch: ${batch.customerName || command.batchId}

📄 Document: ${exportResult.documentUrl}
📊 Spreadsheet: ${exportResult.sheetUrl || 'Processing...'}

Your customs document is ready for download.`,
        success: true
      };
    }
  } catch (error) {
    console.error('Error exporting batch:', error);
    return {
      reply: `❌ Export failed. Please try again or contact support.`,
      success: false
    };
  }
}

/**
 * Format TwiML response for Twilio
 */
export function formatTwilioResponse(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
