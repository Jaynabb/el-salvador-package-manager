/**
 * Universal Messaging Command Service
 * Complete SMS-first system with full web app parity
 *
 * Works with ANY phone number - personal or business, WhatsApp or regular SMS
 * Importers can manage their entire workflow without ever opening the web app!
 */

export type CommandSource = 'sms' | 'whatsapp' | 'telegram' | 'web';

export type CommandType =
  // Batch Management
  | 'create'           // Create new batch
  | 'delete'           // Delete batch
  | 'rename'           // Rename batch
  | 'list'             // List all batches
  | 'status'           // Get batch status
  | 'setweight'        // Set batch weight

  // Export Operations
  | 'export'           // Export batch

  // Screenshot Operations
  | 'screenshots'      // List screenshots in batch
  | 'addphoto'         // Add screenshot to batch (via MMS/upload)

  // Account Operations
  | 'myinfo'           // Get account info
  | 'batches'          // List my batches

  // Help
  | 'help'             // Show commands
  | 'unknown';         // Unknown command

export interface MessagingCommand {
  type: CommandType;
  batchId?: string;
  batchName?: string;
  weight?: number;
  weightUnit?: 'kg' | 'lb';
  deliveryMethod?: 'sms' | 'whatsapp' | 'email';
  email?: string;
  phoneNumber: string;
  rawMessage: string;
  source: CommandSource;
  // Additional parameters for various commands
  parameters?: Record<string, any>;
}

export interface CommandResponse {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Parse incoming message for commands
 * Complete command parser with full web app parity
 *
 * BATCH MANAGEMENT:
 * - /create "Batch Name" - Create new batch
 * - /delete batch-id - Delete batch
 * - /rename batch-id "New Name" - Rename batch
 * - /list - List all my batches
 * - /batches - Same as /list
 * - /status batch-id - Get batch status
 * - /setweight batch-id 10kg - Set batch weight
 *
 * EXPORT:
 * - /export batch-id - Export batch
 * - /export batch-id email:user@example.com - Export via email
 *
 * SCREENSHOTS:
 * - /screenshots batch-id - List screenshots in batch
 *
 * ACCOUNT:
 * - /myinfo - Get my account info
 *
 * HELP:
 * - /help - Show all commands
 *
 * @param message - The message text from any source
 * @param phoneNumber - Phone number (can be personal or business)
 * @param source - Where the message came from (defaults to 'sms')
 */
export function parseCommand(
  message: string,
  phoneNumber: string,
  source: CommandSource = 'sms'
): MessagingCommand {
  const trimmedMessage = message.trim();
  const deliveryMethod = source === 'whatsapp' ? 'whatsapp' : 'sms';

  // Helper to extract quoted strings
  const extractQuoted = (text: string): string | null => {
    const match = text.match(/"([^"]+)"/);
    return match ? match[1] : null;
  };

  // Help command
  if (trimmedMessage === '/help' || trimmedMessage.toLowerCase() === 'help') {
    return {
      type: 'help',
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Create batch: /create "Batch Name"
  const createMatch = trimmedMessage.match(/^\/create\s+"([^"]+)"/i);
  if (createMatch) {
    return {
      type: 'create',
      batchName: createMatch[1],
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Delete batch: /delete batch-id
  const deleteMatch = trimmedMessage.match(/^\/delete\s+([a-zA-Z0-9-]+)/i);
  if (deleteMatch) {
    return {
      type: 'delete',
      batchId: deleteMatch[1],
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Rename batch: /rename batch-id "New Name"
  const renameMatch = trimmedMessage.match(/^\/rename\s+([a-zA-Z0-9-]+)\s+"([^"]+)"/i);
  if (renameMatch) {
    return {
      type: 'rename',
      batchId: renameMatch[1],
      batchName: renameMatch[2],
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Set weight: /setweight batch-id 10kg or /setweight batch-id 22lb
  const setWeightMatch = trimmedMessage.match(/^\/setweight\s+([a-zA-Z0-9-]+)\s+(\d+(?:\.\d+)?)(kg|lb)/i);
  if (setWeightMatch) {
    return {
      type: 'setweight',
      batchId: setWeightMatch[1],
      weight: parseFloat(setWeightMatch[2]),
      weightUnit: setWeightMatch[3].toLowerCase() as 'kg' | 'lb',
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // List batches: /list or /batches
  if (trimmedMessage === '/list' || trimmedMessage === '/batches') {
    return {
      type: 'list',
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // My info: /myinfo
  if (trimmedMessage === '/myinfo') {
    return {
      type: 'myinfo',
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Screenshots in batch: /screenshots batch-id
  const screenshotsMatch = trimmedMessage.match(/^\/screenshots\s+([a-zA-Z0-9-]+)/i);
  if (screenshotsMatch) {
    return {
      type: 'screenshots',
      batchId: screenshotsMatch[1],
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Export command: /export batch-1 or /export batch-1 email:user@example.com
  const exportMatch = trimmedMessage.match(/^\/export\s+([a-zA-Z0-9-]+)(?:\s+email:(\S+))?/i);
  if (exportMatch) {
    const batchId = exportMatch[1];
    const email = exportMatch[2];
    const exportDelivery = email ? 'email' : deliveryMethod;

    return {
      type: 'export',
      batchId,
      deliveryMethod: exportDelivery,
      email,
      phoneNumber,
      rawMessage: message,
      source
    };
  }

  // Status command: /status batch-1
  const statusMatch = trimmedMessage.match(/^\/status\s+([a-zA-Z0-9-]+)/i);
  if (statusMatch) {
    return {
      type: 'status',
      batchId: statusMatch[1],
      phoneNumber,
      rawMessage: message,
      source,
      deliveryMethod
    };
  }

  // Unknown command
  return {
    type: 'unknown',
    phoneNumber,
    rawMessage: message,
    source,
    deliveryMethod
  };
}

/**
 * Legacy function name for backwards compatibility
 * @deprecated Use parseCommand() instead
 */
export function parseWhatsAppCommand(message: string, phoneNumber: string): MessagingCommand {
  return parseCommand(message, phoneNumber, 'whatsapp');
}

/**
 * Generate comprehensive help message for all commands
 * Full web app parity - importers never need to open the web app!
 */
export function getHelpMessage(source: CommandSource = 'sms'): string {
  const deliveryChannel = source === 'whatsapp' ? 'WhatsApp' : 'SMS';

  return `📦 *ImportFlow - Complete SMS Control*

🆕 *BATCH MANAGEMENT*
*/create "Batch Name"*
Create a new batch
Example: /create "December Shipment"

*/delete [batch-id]*
Delete a batch
Example: /delete batch-1

*/rename [batch-id] "New Name"*
Rename a batch
Example: /rename batch-1 "January Shipment"

*/list* or */batches*
List all your batches
Example: /list

*/setweight [batch-id] [weight]kg|lb*
Set batch weight
Example: /setweight batch-1 10kg

📊 *BATCH INFO*
*/status [batch-id]*
Get batch status and details
Example: /status batch-1

*/screenshots [batch-id]*
List all screenshots in a batch
Example: /screenshots batch-1

📄 *EXPORT*
*/export [batch-id]*
Export batch and receive via ${deliveryChannel}
Example: /export batch-1

*/export [batch-id] email:[email]*
Export batch and send to email
Example: /export batch-1 email:user@example.com

👤 *ACCOUNT*
*/myinfo*
Get your account information
Example: /myinfo

❓ *HELP*
*/help*
Show this message

---
💡 *Complete SMS-first workflow!*
Never need to open the web app if you don't want to.
Works with ANY phone - personal or business!

*Questions?* Contact ImportFlow support.`;
}

/**
 * Generate status message for a batch
 */
export function getBatchStatusMessage(batch: any): string {
  if (!batch) {
    return '❌ Batch not found';
  }

  const statusEmoji = {
    'draft': '📝',
    'processing': '⏳',
    'ready': '✅',
    'exported': '📄',
    'error': '❌'
  };

  const emoji = statusEmoji[batch.status as keyof typeof statusEmoji] || '📦';

  return `${emoji} *Batch Status: ${batch.name}*

Status: ${batch.status}
Screenshots: ${batch.screenshotCount || 0}
Created: ${batch.createdAt ? new Date(batch.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
${batch.weight ? `Weight: ${batch.weight} ${batch.weightUnit}` : ''}

${batch.status === 'ready' ? '✅ Ready to export! Use /export ' + batch.id : ''}`;
}

/**
 * Generate unknown command message
 */
export function getUnknownCommandMessage(): string {
  return `❓ Unknown command. Type */help* to see available commands.`;
}
