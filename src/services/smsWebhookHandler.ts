/**
 * SMS Webhook Handler
 *
 * Receives incoming SMS messages from Twilio (or any SMS provider)
 * and processes ImportFlow commands
 *
 * Works with ANY phone number - personal or business, no WhatsApp Business required!
 */

import type { Batch, Screenshot } from '../types';
import { parseCommand, getHelpMessage, getBatchStatusMessage, getUnknownCommandMessage } from './whatsappCommandService';
import { exportAndDeliverBatch } from './batchExportService';

/**
 * Twilio webhook request body
 */
export interface TwilioSMSWebhook {
  From: string;        // Phone number in E.164 format (+15035551234)
  To: string;          // Your Twilio number
  Body: string;        // Message text
  MessageSid: string;  // Unique message ID
}

/**
 * Generic SMS webhook request (works with any provider)
 */
export interface GenericSMSWebhook {
  from: string;
  to: string;
  body: string;
  messageId?: string;
}

/**
 * Process incoming SMS webhook from Twilio
 *
 * Example Twilio webhook payload:
 * {
 *   "From": "+15035551234",
 *   "To": "+15035559876",
 *   "Body": "/export batch-1",
 *   "MessageSid": "SM..."
 * }
 */
export async function processTwilioSMS(
  webhookData: TwilioSMSWebhook,
  getBatch: (batchId: string, phoneNumber: string) => Promise<Batch | null>,
  getScreenshots: (batchId: string) => Promise<Screenshot[]>
): Promise<{ reply: string; success: boolean }> {
  const phoneNumber = webhookData.From;
  const message = webhookData.Body;

  return processGenericSMS(
    { from: phoneNumber, to: webhookData.To, body: message },
    getBatch,
    getScreenshots
  );
}

/**
 * Process incoming SMS from any provider
 *
 * This is the main processing function that handles all SMS commands
 */
export async function processGenericSMS(
  webhookData: GenericSMSWebhook,
  getBatch: (batchId: string, phoneNumber: string) => Promise<Batch | null>,
  getScreenshots: (batchId: string) => Promise<Screenshot[]>
): Promise<{ reply: string; success: boolean }> {
  const phoneNumber = webhookData.from;
  const message = webhookData.body;

  console.log(`📱 Incoming SMS from ${phoneNumber}: ${message}`);

  // Parse the command (source = 'sms')
  const command = parseCommand(message, phoneNumber, 'sms');

  // Handle help command
  if (command.type === 'help') {
    return {
      reply: getHelpMessage('sms'),
      success: true
    };
  }

  // Handle unknown command
  if (command.type === 'unknown') {
    return {
      reply: getUnknownCommandMessage(),
      success: false
    };
  }

  // Handle status command
  if (command.type === 'status' && command.batchId) {
    try {
      const batch = await getBatch(command.batchId, phoneNumber);

      if (!batch) {
        return {
          reply: '❌ Batch not found or you don\'t have access to it.',
          success: false
        };
      }

      const screenshots = await getScreenshots(command.batchId);
      const batchWithCount = {
        ...batch,
        screenshotCount: screenshots.length
      };

      return {
        reply: getBatchStatusMessage(batchWithCount),
        success: true
      };
    } catch (error) {
      console.error('Error fetching batch status:', error);
      return {
        reply: '❌ Error retrieving batch status. Please try again.',
        success: false
      };
    }
  }

  // Handle export command
  if (command.type === 'export' && command.batchId) {
    try {
      const batch = await getBatch(command.batchId, phoneNumber);

      if (!batch) {
        return {
          reply: '❌ Batch not found or you don\'t have access to it.',
          success: false
        };
      }

      const screenshots = await getScreenshots(command.batchId);

      if (screenshots.length === 0) {
        return {
          reply: '❌ This batch has no screenshots to export.',
          success: false
        };
      }

      // Check if batch is ready
      if (batch.status !== 'ready') {
        return {
          reply: `⚠️ Batch "${batch.customerName || command.batchId}" is not ready for export.\n\nCurrent status: ${batch.status}\n\nPlease ensure all screenshots are processed before exporting.`,
          success: false
        };
      }

      // Start export process
      const exportResult = await exportAndDeliverBatch(
        batch,
        screenshots,
        command.deliveryMethod || 'sms',
        command.email || phoneNumber
      );

      if (!exportResult.success) {
        return {
          reply: `❌ Export failed: ${exportResult.message}`,
          success: false
        };
      }

      // Success! Send confirmation
      if (command.deliveryMethod === 'email' && command.email) {
        return {
          reply: `✅ Batch exported successfully!\n\n📧 Documents sent to: ${command.email}\n\n📄 Google Doc: ${exportResult.documentUrl}\n📊 Google Sheet: ${exportResult.sheetUrl || 'Processing...'}`,
          success: true
        };
      } else {
        // SMS delivery
        return {
          reply: `✅ Batch Export Ready\n\n📦 Batch: ${batch.customerName || command.batchId}\n\n📄 Document: ${exportResult.documentUrl}\n${exportResult.sheetUrl ? `📊 Spreadsheet: ${exportResult.sheetUrl}` : ''}\n\nYour customs document is ready for download.`,
          success: true
        };
      }
    } catch (error) {
      console.error('Error exporting batch:', error);
      return {
        reply: '❌ Error exporting batch. Please try again or contact support.',
        success: false
      };
    }
  }

  // Fallback
  return {
    reply: getUnknownCommandMessage(),
    success: false
  };
}

/**
 * Format response for Twilio TwiML
 *
 * Twilio expects TwiML XML format for SMS responses
 */
export function formatTwilioResponse(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Example Express.js webhook endpoint
 *
 * This is what you would deploy to handle incoming SMS
 */
export const exampleExpressEndpoint = `
// Example Express.js endpoint for Twilio SMS webhook
import express from 'express';
import { processTwilioSMS, formatTwilioResponse } from './smsWebhookHandler';
import { getBatchByIdAndPhone, getScreenshotsByBatchId } from './firestoreClient';

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/sms/webhook', async (req, res) => {
  try {
    const result = await processTwilioSMS(
      req.body,
      getBatchByIdAndPhone,
      getScreenshotsByBatchId
    );

    // Send TwiML response
    res.type('text/xml');
    res.send(formatTwilioResponse(result.reply));
  } catch (error) {
    console.error('SMS webhook error:', error);
    res.type('text/xml');
    res.send(formatTwilioResponse('❌ System error. Please try again later.'));
  }
});

app.listen(3000, () => {
  console.log('📱 SMS webhook server running on port 3000');
});
`;
