/**
 * Command Parser Utility
 * Parses WhatsApp slash commands
 */

export interface ParsedCommand {
  command: string;
  args: string[];
  options: Record<string, string>;
}

/**
 * Parse a slash command from WhatsApp message
 *
 * Examples:
 * - "/export batch-1" -> {command: "export", args: ["batch-1"], options: {}}
 * - "/export batch-1 email:user@example.com" -> {command: "export", args: ["batch-1"], options: {email: "user@example.com"}}
 * - "/status batch-1" -> {command: "status", args: ["batch-1"], options: {}}
 * - "/help" -> {command: "help", args: [], options: {}}
 */
export function parseCommand(message: string): ParsedCommand | null {
  if (!message || !message.trim().startsWith("/")) {
    return null;
  }

  const trimmed = message.trim();
  const parts = trimmed.split(/\s+/);

  // Extract command (remove leading slash)
  const command = parts[0].substring(1).toLowerCase();

  if (!command) {
    return null;
  }

  const args: string[] = [];
  const options: Record<string, string> = {};

  // Parse arguments and options
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Check if it's an option (key:value format)
    if (part.includes(":")) {
      const [key, ...valueParts] = part.split(":");
      const value = valueParts.join(":"); // Handle values with colons
      options[key.toLowerCase()] = value;
    } else {
      // Regular argument
      args.push(part);
    }
  }

  return {
    command,
    args,
    options,
  };
}

/**
 * Validate if command is supported
 */
export function isValidCommand(command: string): boolean {
  const validCommands = ["status", "help"];
  return validCommands.includes(command.toLowerCase());
}

/**
 * Get help text for a command
 */
export function getCommandHelp(command?: string): string {
  if (!command) {
    return `📱 ImportFlow WhatsApp Commands

Available commands:

/export <doc-id>
  Export a doc and receive Google Doc link
  Example: /export doc-abc123

/export <doc-id> email:<email>
  Export and send to email
  Example: /export doc-abc123 email:user@example.com

/status <doc-id>
  Check doc status
  Example: /status doc-abc123

/help
  Show this help message

Need assistance? Log into the web app at importflow-app.web.app`;
  }

  switch (command.toLowerCase()) {
    case "export":
      return `📄 /export Command

Usage:
  /export <doc-id> [email:<email>]

Examples:
  /export doc-abc123
  /export doc-abc123 email:customs@company.com

This will:
  1. Generate a Google Doc with all orders
  2. Export all order screenshots and data
  3. Send link to WhatsApp (or email if specified)`;

    case "status":
      return `📊 /status Command

Usage:
  /status <doc-id>

Example:
  /status doc-abc123

Shows:
  - Doc status (active/ready/exported)
  - Number of orders
  - Customer names
  - Creation date`;

    case "help":
      return getCommandHelp();

    default:
      return `❓ Unknown command: ${command}\n\nType /help to see all available commands.`;
  }
}
