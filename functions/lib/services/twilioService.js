"use strict";
/**
 * Twilio Service
 * Handles WhatsApp message sending via Twilio
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppMessage = sendWhatsAppMessage;
exports.sendWhatsAppReply = sendWhatsAppReply;
exports.validateTwilioSignature = validateTwilioSignature;
exports.formatWhatsAppNumber = formatWhatsAppNumber;
exports.extractPhoneNumber = extractPhoneNumber;
const twilio_1 = __importDefault(require("twilio"));
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";
let twilioClient = null;
/**
 * Get or initialize Twilio client
 */
function getTwilioClient() {
    if (!accountSid || !authToken) {
        throw new Error("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
    }
    if (!twilioClient) {
        twilioClient = (0, twilio_1.default)(accountSid, authToken);
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
async function sendWhatsAppMessage(to, message) {
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
    }
    catch (error) {
        console.error("Failed to send WhatsApp message:", error);
        throw error;
    }
}
/**
 * Send a WhatsApp message with multiple lines
 */
async function sendWhatsAppReply(to, lines) {
    const message = lines.join("\n");
    return sendWhatsAppMessage(to, message);
}
/**
 * Validate Twilio webhook signature (security)
 */
function validateTwilioSignature(signature, url, params) {
    if (!authToken) {
        console.warn("Cannot validate Twilio signature: AUTH_TOKEN not set");
        return true; // Allow in development
    }
    try {
        return twilio_1.default.validateRequest(authToken, signature, url, params);
    }
    catch (error) {
        console.error("Error validating Twilio signature:", error);
        return false;
    }
}
/**
 * Format phone number for WhatsApp (add whatsapp: prefix)
 */
function formatWhatsAppNumber(phone) {
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
function extractPhoneNumber(whatsappNumber) {
    return whatsappNumber.replace("whatsapp:", "");
}
//# sourceMappingURL=twilioService.js.map