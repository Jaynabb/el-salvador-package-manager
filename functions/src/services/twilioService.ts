/**
 * Twilio Service
 * Handles WhatsApp message sending via Twilio
 */

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

let twilioClient: twilio.Twilio | null = null;

/**
 * Get or initialize Twilio client
 */
function getTwilioClient(): twilio.Twilio {
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }

  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }

  return twilioClient;
}

/**
 * Send a WhatsApp message
 *
 * @param to - Recipient phone number (e.g., "+503 7777-8888")
 * @param message - Message text to send
 * @returns Message SID
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<string> {
  const client = getTwilioClient();

  // Ensure 'to' number has whatsapp: prefix
  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to.replace(/\s/g, "")}`;

  try {
    const response = await client.messages.create({
      from: whatsappNumber,
      to: toNumber,
      body: message,
    });

    console.log(`WhatsApp message sent to ${toNumber}: ${response.sid}`);
    return response.sid;
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
    throw error;
  }
}

/**
 * Send a WhatsApp message with multiple lines
 */
export async function sendWhatsAppReply(
  to: string,
  lines: string[]
): Promise<string> {
  const message = lines.join("\n");
  return sendWhatsAppMessage(to, message);
}

/**
 * Validate Twilio webhook signature (security)
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, any>
): boolean {
  if (!authToken) {
    console.warn("Cannot validate Twilio signature: AUTH_TOKEN not set");
    return true; // Allow in development
  }

  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error) {
    console.error("Error validating Twilio signature:", error);
    return false;
  }
}

/**
 * Format phone number for WhatsApp (add whatsapp: prefix)
 */
export function formatWhatsAppNumber(phone: string): string {
  if (phone.startsWith("whatsapp:")) {
    return phone;
  }

  // Remove spaces and special characters
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");

  // Ensure it starts with +
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;

  return `whatsapp:${withPlus}`;
}

/**
 * Extract phone number from WhatsApp format
 */
export function extractPhoneNumber(whatsappNumber: string): string {
  return whatsappNumber.replace("whatsapp:", "");
}
