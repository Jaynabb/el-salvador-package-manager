"use strict";
/**
 * Firebase Cloud Functions
 * WhatsApp Integration - Complete Bridge to ImportFlow App
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twilioWhatsAppWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const cors_1 = __importDefault(require("cors"));
const commandParser_1 = require("./utils/commandParser");
const twilioService_1 = require("./services/twilioService");
const commandHandlers_1 = require("./handlers/commandHandlers");
const geminiService_1 = require("./services/geminiService");
const corsHandler = (0, cors_1.default)({ origin: true });
// Initialize Firebase Admin
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const storage = (0, storage_1.getStorage)();
/**
 * User session data (in-memory storage for active conversations)
 * In production, consider using Firestore or Redis for persistence
 */
const userSessions = new Map();
/**
 * Clean up old sessions (older than 1 hour)
 */
function cleanOldSessions() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [phone, session] of userSessions.entries()) {
        if (session.lastActivity < oneHourAgo) {
            userSessions.delete(phone);
        }
    }
}
/**
 * Twilio WhatsApp Webhook
 * Handles incoming WhatsApp messages and creates orders directly
 */
exports.twilioWhatsAppWebhook = (0, https_1.onRequest)({
    timeoutSeconds: 60,
    memory: "512MiB",
    invoker: "public",
}, async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a, _b;
        // Only accept POST requests
        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }
        try {
            // Clean old sessions periodically
            cleanOldSessions();
            // Validate Twilio signature (security)
            const twilioSignature = req.headers["x-twilio-signature"];
            const url = `https://${req.hostname}${req.path}`;
            if (twilioSignature && !(0, twilioService_1.validateTwilioSignature)(twilioSignature, url, req.body)) {
                console.warn("Invalid Twilio signature");
                res.status(403).send("Forbidden");
                return;
            }
            // Extract Twilio parameters
            const { From, Body, NumMedia, MediaUrl0, MediaContentType0, } = req.body;
            const senderPhone = (0, twilioService_1.extractPhoneNumber)(From);
            const messageText = (Body === null || Body === void 0 ? void 0 : Body.trim()) || "";
            const numMedia = parseInt(NumMedia || "0");
            console.log(`WhatsApp message from ${senderPhone}: ${messageText || `${numMedia} media`}`);
            // Check if it's a slash command
            if (messageText.startsWith("/")) {
                const parsed = (0, commandParser_1.parseCommand)(messageText);
                if (!parsed || !(0, commandParser_1.isValidCommand)(parsed.command)) {
                    await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `❓ Unknown command: ${messageText}\n\nType /help to see available commands.`);
                    res.status(200).send("OK");
                    return;
                }
                // Route to appropriate command handler
                switch (parsed.command) {
                    case "export":
                        await (0, commandHandlers_1.handleExportCommand)(senderPhone, parsed.args, parsed.options);
                        break;
                    case "status":
                        await (0, commandHandlers_1.handleStatusCommand)(senderPhone, parsed.args);
                        break;
                    case "help":
                        await (0, commandHandlers_1.handleHelpCommand)(senderPhone, parsed.args);
                        break;
                    default:
                        await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `❓ Command not implemented: ${parsed.command}\n\nType /help for available commands.`);
                }
                res.status(200).send("OK");
                return;
            }
            // Get or create user session first
            let session = userSessions.get(senderPhone);
            if (!session) {
                session = {
                    currentCustomerName: null,
                    lastActivity: Date.now(),
                    errorSent: false,
                    lastErrorTime: 0,
                };
                userSessions.set(senderPhone, session);
            }
            // Update last activity
            session.lastActivity = Date.now();
            // Find user by phone number
            console.log(`Looking up user with phone: ${senderPhone}`);
            const user = await findUserByPhone(senderPhone);
            if (!user) {
                // Only send error message once per 5 minutes
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                if (!session.errorSent || session.lastErrorTime < fiveMinutesAgo) {
                    console.log(`User not found for phone: ${senderPhone}`);
                    await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `❌ Phone number not registered\n\nPlease link your WhatsApp number in the ImportFlow app.\n\nGo to Firestore Console and add:\nField: whatsappPhone\nValue: ${senderPhone}`);
                    session.errorSent = true;
                    session.lastErrorTime = Date.now();
                    userSessions.set(senderPhone, session);
                }
                res.status(200).send("OK");
                return;
            }
            // User found - reset error flag
            session.errorSent = false;
            // Handle text message (set customer name)
            if (messageText && numMedia === 0) {
                session.currentCustomerName = messageText;
                userSessions.set(senderPhone, session);
                await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `✅ Customer name set: ${messageText}\n\nNow send screenshots for this customer.`);
                res.status(200).send("OK");
                return;
            }
            // Handle image message
            if (numMedia > 0 && MediaUrl0) {
                // Check if customer name is set
                if (!session.currentCustomerName) {
                    await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `⚠️ Please send customer name first\n\nExample:\nJuan Perez\n[then send screenshots]`);
                    res.status(200).send("OK");
                    return;
                }
                const customerName = session.currentCustomerName;
                // Download image from Twilio
                console.log(`Downloading image from: ${MediaUrl0}`);
                const imageResponse = await fetch(MediaUrl0);
                if (!imageResponse.ok) {
                    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
                }
                const imageBuffer = await imageResponse.arrayBuffer();
                const imageBytes = Buffer.from(imageBuffer);
                // Generate unique filename
                const timestamp = Date.now();
                const fileExtension = getFileExtension(MediaContentType0 || "image/jpeg");
                const fileName = `${user.organizationId}/${timestamp}_${customerName.replace(/\s+/g, "_")}.${fileExtension}`;
                const storagePath = `screenshots/${fileName}`;
                // Upload to Firebase Storage
                const bucket = storage.bucket();
                const file = bucket.file(storagePath);
                await file.save(imageBytes, {
                    metadata: {
                        contentType: MediaContentType0 || "image/jpeg",
                        metadata: {
                            customerName,
                            uploadedBy: user.id,
                            organizationId: user.organizationId,
                            source: "whatsapp",
                            uploadedAt: new Date().toISOString(),
                        },
                    },
                });
                // Get download URL
                const [downloadUrl] = await file.getSignedUrl({
                    action: "read",
                    expires: "03-01-2500", // Far future date
                });
                console.log(`Image uploaded to: ${storagePath}`);
                // Convert to base64 for AI extraction
                const base64 = imageBytes.toString("base64");
                // Send processing message
                await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `📸 Screenshot received for ${customerName}\n\n⏳ Extracting order data...`);
                // Extract data with Gemini AI
                const extractedData = await (0, geminiService_1.analyzeOrderScreenshot)(base64);
                console.log(`Extracted data:`, extractedData);
                // Create order in Firestore
                const orderData = {
                    // Customer info
                    customerName,
                    customerPhone: senderPhone,
                    // Organization & User
                    organizationId: user.organizationId,
                    uploadedBy: user.id,
                    uploadedByName: user.displayName || user.email,
                    // Image
                    imageUrl: downloadUrl,
                    imagePath: storagePath,
                    imageType: MediaContentType0 || "image/jpeg",
                    // Extracted data from AI
                    trackingNumber: extractedData.trackingNumber || null,
                    orderNumber: extractedData.orderNumber || null,
                    seller: extractedData.seller || null,
                    orderDate: extractedData.orderDate || null,
                    items: extractedData.items || [],
                    orderTotal: extractedData.orderTotal || null,
                    // Status
                    status: "pending-review",
                    extractionStatus: "completed",
                    // Source
                    source: "whatsapp",
                    // Timestamps
                    createdAt: firestore_1.Timestamp.now(),
                    updatedAt: firestore_1.Timestamp.now(),
                };
                const orderRef = await db.collection("orders").add(orderData);
                console.log(`Order created: ${orderRef.id}`);
                // Send success message
                const itemsSummary = ((_a = extractedData.items) === null || _a === void 0 ? void 0 : _a.length) > 0 ?
                    extractedData.items.map((item) => `• ${item.name} (${item.quantity}x) - $${item.totalValue.toFixed(2)}`).join("\n") :
                    "No items extracted";
                await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `✅ Order created for ${customerName}\n\n` +
                    `${itemsSummary}\n\n` +
                    `Total: $${((_b = extractedData.orderTotal) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || "0.00"}\n\n` +
                    `📱 Review in ImportFlow app\n` +
                    `Status: Pending Review\n\n` +
                    `Send more screenshots for ${customerName} or send a new customer name.`);
                res.status(200).send("OK");
                return;
            }
            // Unknown message type
            await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, "📱 Send:\n• Customer name (text)\n• Order screenshots (images)\n• /help for commands");
            res.status(200).send("OK");
        }
        catch (error) {
            console.error("Error handling WhatsApp message:", error);
            await (0, twilioService_1.sendWhatsAppMessage)((0, twilioService_1.extractPhoneNumber)(req.body.From), `❌ Error processing your message\n\nPlease try again or contact support.`).catch(() => {
                // Ignore error sending error message
            });
            res.status(500).json({ error: "Internal server error" });
        }
    });
});
/**
 * Find user by WhatsApp phone number
 */
async function findUserByPhone(phone) {
    console.log(`Searching Firestore for user with whatsappPhone: "${phone}"`);
    const snapshot = await db.collection("users")
        .where("whatsappPhone", "==", phone)
        .where("status", "==", "active")
        .limit(1)
        .get();
    console.log(`Found ${snapshot.size} user(s) matching phone: ${phone}`);
    if (!snapshot.empty) {
        const userData = Object.assign({ id: snapshot.docs[0].id }, snapshot.docs[0].data());
        console.log(`User found: ${userData.email || userData.id} (${userData.id})`);
        return userData;
    }
    console.log(`No user found with whatsappPhone: "${phone}"`);
    return null;
}
/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType) {
    const mimeToExt = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
    };
    return mimeToExt[mimeType.toLowerCase()] || "jpg";
}
//# sourceMappingURL=index.js.map