"use strict";
/**
 * Firebase Cloud Functions
 * WhatsApp Integration with Twilio + Slash Commands
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processBatchScreenshots = exports.receiveWhatsAppMessage = exports.twilioWhatsAppWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const cors_1 = __importDefault(require("cors"));
const commandParser_1 = require("./utils/commandParser");
const twilioService_1 = require("./services/twilioService");
const commandHandlers_1 = require("./handlers/commandHandlers");
const geminiService_1 = require("./services/geminiService");
const googleDocsService_1 = require("./services/googleDocsService");
const dutyCalculator_1 = require("./utils/dutyCalculator");
const packageNumberGenerator_1 = require("./utils/packageNumberGenerator");
const corsHandler = (0, cors_1.default)({ origin: true });
// Initialize Firebase Admin
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * Twilio WhatsApp Webhook
 * Handles incoming WhatsApp messages directly from Twilio
 */
exports.twilioWhatsAppWebhook = (0, https_1.onRequest)({
    timeoutSeconds: 60,
    memory: "512MiB",
    invoker: "public",
}, async (req, res) => {
    return corsHandler(req, res, async () => {
        // Only accept POST requests
        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }
        try {
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
            // Not a command - handle as regular message or image
            // Find or create importer by phone
            const importer = await findImporterByPhone(senderPhone);
            const importerId = (importer === null || importer === void 0 ? void 0 : importer.id) || "default";
            // Find or create active batch
            let batch = await getActiveBatch(importerId);
            if (!batch) {
                // Create new batch
                const batchRef = await db.collection("batches").add({
                    importerId,
                    customerName: null,
                    customerPhone: senderPhone,
                    screenshotIds: [],
                    screenshotCount: 0,
                    status: "active",
                    hasWhatsAppScreenshots: true,
                    hasManualScreenshots: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                batch = {
                    id: batchRef.id,
                    importerId,
                    customerName: null,
                    customerPhone: senderPhone,
                    screenshotIds: [],
                    screenshotCount: 0,
                    status: "active",
                    hasWhatsAppScreenshots: true,
                    hasManualScreenshots: false,
                };
                console.log(`Created new batch: ${batch.id}`);
            }
            // Handle text message (customer name)
            if (messageText && numMedia === 0) {
                await db.collection("batches").doc(batch.id).update({
                    customerName: messageText,
                    updatedAt: new Date(),
                });
                await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `✅ Customer name set: ${messageText}\n\nSend screenshots now.\n\nBatch ID: ${batch.id}`);
                res.status(200).send("OK");
                return;
            }
            // Handle image message
            if (numMedia > 0 && MediaUrl0) {
                // Download image from Twilio
                const imageResponse = await fetch(MediaUrl0);
                const imageBuffer = await imageResponse.arrayBuffer();
                const base64 = Buffer.from(imageBuffer).toString("base64");
                // Save screenshot
                const screenshotRef = await db.collection("screenshots").add({
                    batchId: batch.id,
                    importerId,
                    source: "whatsapp",
                    imageBase64: base64,
                    imageType: MediaContentType0 || "image/jpeg",
                    extractionStatus: "pending",
                    uploadedAt: new Date(),
                });
                // Update batch
                await db.collection("batches").doc(batch.id).update({
                    screenshotIds: firestore_1.FieldValue.arrayUnion(screenshotRef.id),
                    screenshotCount: firestore_1.FieldValue.increment(1),
                    updatedAt: new Date(),
                });
                // Extract data in background (don't wait)
                extractScreenshotDataAsync(screenshotRef.id, base64);
                await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `✅ Screenshot ${batch.screenshotCount + 1} received!\n\n` +
                    `Batch: ${batch.customerName || "No name yet"}\n` +
                    `Batch ID: ${batch.id}\n\n` +
                    `Send more screenshots or use:\n` +
                    `/export ${batch.id} - to export\n` +
                    `/status ${batch.id} - to check status`);
                res.status(200).send("OK");
                return;
            }
            // Unknown message type
            await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, "📱 Send me:\n• Text message with customer name\n• Order screenshots\n• Commands like /help, /export, /status");
            res.status(200).send("OK");
        }
        catch (error) {
            console.error("Error handling WhatsApp message:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });
});
/**
 * Extract screenshot data asynchronously
 */
async function extractScreenshotDataAsync(screenshotId, base64) {
    try {
        await db.collection("screenshots").doc(screenshotId).update({
            extractionStatus: "processing",
        });
        const extracted = await (0, geminiService_1.analyzeOrderScreenshot)(base64);
        await db.collection("screenshots").doc(screenshotId).update({
            extractedData: extracted,
            extractionStatus: "completed",
            processedAt: new Date(),
        });
        console.log(`Screenshot ${screenshotId} extracted successfully`);
    }
    catch (error) {
        console.error(`Failed to extract screenshot ${screenshotId}:`, error);
        await db.collection("screenshots").doc(screenshotId).update({
            extractionStatus: "error",
            extractionError: String(error),
        });
    }
}
/**
 * Find importer by registered phone number
 */
async function findImporterByPhone(phone) {
    const snapshot = await db.collection("importers")
        .where("phone", "==", phone)
        .where("status", "==", "active")
        .limit(1)
        .get();
    if (!snapshot.empty) {
        return Object.assign({ id: snapshot.docs[0].id }, snapshot.docs[0].data());
    }
    return null;
}
/**
 * Get active batch for importer
 */
async function getActiveBatch(importerId) {
    const snapshot = await db.collection("batches")
        .where("importerId", "==", importerId)
        .where("status", "==", "active")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    if (!snapshot.empty) {
        return Object.assign({ id: snapshot.docs[0].id }, snapshot.docs[0].data());
    }
    return null;
}
/**
 * LEGACY ENDPOINT: Receive WhatsApp Message from Make.com
 * (Keep for backward compatibility)
 */
exports.receiveWhatsAppMessage = (0, https_1.onRequest)({
    timeoutSeconds: 60,
    memory: "256MiB",
}, async (req, res) => {
    return corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed. Use POST." });
            return;
        }
        try {
            const { senderPhone, messageType, textContent, imageBase64, imageType } = req.body;
            if (!senderPhone || !messageType) {
                res.status(400).json({
                    error: "Missing required fields: senderPhone and messageType",
                });
                return;
            }
            console.log(`Received ${messageType} message from ${senderPhone}`);
            // Find or create importer by phone
            const importer = await findImporterByPhone(senderPhone);
            const importerId = (importer === null || importer === void 0 ? void 0 : importer.id) || "default";
            // Find or create active conversation for this sender
            let conversation = await findActiveConversation(senderPhone);
            const now = new Date();
            if (!conversation) {
                // Create new conversation
                const convRef = await db.collection("conversations").add({
                    senderPhone,
                    extractedCustomerName: null,
                    messageIds: [],
                    imageCount: 0,
                    textCount: 0,
                    status: "active",
                    importerId,
                    firstMessageAt: now,
                    lastMessageAt: now,
                });
                conversation = {
                    id: convRef.id,
                    senderPhone,
                    importerId,
                    extractedCustomerName: null,
                    messageIds: [],
                    imageCount: 0,
                    textCount: 0,
                    status: "active",
                    firstMessageAt: now,
                    lastMessageAt: now,
                };
            }
            // Store the message
            const messageData = {
                senderPhone,
                messageType,
                textContent: messageType === "text" ? textContent : undefined,
                imageBase64: messageType === "image" ? imageBase64 : undefined,
                imageType: messageType === "image" ? imageType : undefined,
                conversationId: conversation.id,
                status: "pending",
                processed: false,
                importerId,
                receivedAt: now,
            };
            const messageRef = await db.collection("incomingMessages").add(messageData);
            // Update conversation
            const updateData = {
                messageIds: firestore_1.FieldValue.arrayUnion(messageRef.id),
                lastMessageAt: now,
            };
            if (messageType === "image") {
                updateData.imageCount = firestore_1.FieldValue.increment(1);
            }
            else if (messageType === "text") {
                updateData.textCount = firestore_1.FieldValue.increment(1);
                // Try to extract customer name from text
                const extractedName = extractCustomerName(textContent);
                if (extractedName) {
                    updateData.extractedCustomerName = extractedName;
                }
            }
            await db.collection("conversations").doc(conversation.id).update(updateData);
            // Mark conversation as "ready" if it has both name and images
            await checkAndMarkConversationReady(conversation.id);
            res.status(200).json({
                success: true,
                messageId: messageRef.id,
                conversationId: conversation.id,
                message: `${messageType} message received and stored`,
            });
        }
        catch (error) {
            console.error("Error receiving message:", error);
            res.status(500).json({
                error: "Failed to receive message",
                details: error.message,
            });
        }
    });
});
/**
 * LEGACY ENDPOINT: Process Batch Screenshots
 * (Keep for backward compatibility)
 */
exports.processBatchScreenshots = (0, https_1.onRequest)({
    timeoutSeconds: 540,
    memory: "1GiB",
}, async (req, res) => {
    return corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed. Use POST." });
            return;
        }
        try {
            const { conversationId, customerName: providedName } = req.body;
            if (!conversationId) {
                res.status(400).json({ error: "Missing conversationId" });
                return;
            }
            // Get conversation
            const convDoc = await db.collection("conversations").doc(conversationId).get();
            if (!convDoc.exists) {
                res.status(404).json({ error: "Conversation not found" });
                return;
            }
            const conversation = Object.assign({ id: convDoc.id }, convDoc.data());
            // Get customer name (from provided or extracted)
            const customerName = providedName || conversation.extractedCustomerName;
            if (!customerName) {
                res.status(400).json({
                    error: "Customer name not provided and not found in conversation messages",
                });
                return;
            }
            // Get all messages in conversation
            const messagesSnapshot = await db.collection("incomingMessages")
                .where("conversationId", "==", conversationId)
                .where("messageType", "==", "image")
                .where("processed", "==", false)
                .get();
            if (messagesSnapshot.empty) {
                res.status(400).json({ error: "No unprocessed images found in conversation" });
                return;
            }
            const imageMessages = messagesSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            console.log(`Processing ${imageMessages.length} screenshots for ${customerName}`);
            // Process each screenshot with Gemini AI
            const extractedDataArray = [];
            for (const message of imageMessages) {
                try {
                    if (!message.imageBase64) {
                        console.error(`Missing imageBase64 for message ${message.id}`);
                        extractedDataArray.push({ items: [] });
                        continue;
                    }
                    const extracted = await (0, geminiService_1.analyzeOrderScreenshot)(message.imageBase64);
                    extractedDataArray.push(extracted);
                }
                catch (error) {
                    console.error(`Failed to analyze screenshot ${message.id}:`, error);
                    extractedDataArray.push({ items: [] }); // Add empty to maintain array length
                }
            }
            // Combine all data
            const allTrackingNumbers = extractedDataArray
                .map((d) => d.trackingNumber)
                .filter((t) => Boolean(t));
            const allItems = extractedDataArray.flatMap((d) => d.items || []);
            const totalValue = allItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
            // Calculate customs duties
            const { duty, vat, totalFees } = (0, dutyCalculator_1.calculateDuty)(totalValue, allItems);
            // Generate package number
            const packageNumber = await (0, packageNumberGenerator_1.generatePackageNumber)();
            // Find or create customer
            const customer = await findOrCreateCustomer(conversation.senderPhone, customerName, conversation.importerId);
            // Create package record
            const packageData = {
                packageNumber,
                trackingNumbers: allTrackingNumbers,
                customerId: customer.id,
                customerName,
                customerPhone: conversation.senderPhone,
                items: allItems,
                totalValue,
                screenshotCount: imageMessages.length,
                screenshotIds: imageMessages.map((m) => m.id).filter((id) => Boolean(id)),
                customsDeclaration: {
                    declaredValue: totalValue,
                    currency: "USD",
                    purpose: "personal",
                    estimatedDuty: duty,
                    estimatedVAT: vat,
                },
                customsDuty: duty,
                vat,
                totalFees,
                status: "pending-arrival",
                paymentStatus: "pending",
                orderDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                notes: `Batch processed from ${imageMessages.length} WhatsApp screenshots`,
            };
            const packageRef = await db.collection("packages").add(packageData);
            const packageId = packageRef.id;
            console.log(`Created package: ${packageId} (${packageNumber})`);
            // Create Google Doc
            const docUrl = await (0, googleDocsService_1.createBatchDocument)(Object.assign(Object.assign({}, packageData), { id: packageId }));
            // Update package with doc URL
            await packageRef.update({ documentUrls: [docUrl] });
            // Mark all messages as processed
            const batch = db.batch();
            for (const message of imageMessages) {
                if (!message.id)
                    continue;
                const msgRef = db.collection("incomingMessages").doc(message.id);
                batch.update(msgRef, {
                    processed: true,
                    status: "processed",
                    packageId,
                    processedAt: new Date(),
                });
            }
            await batch.commit();
            // Update conversation
            await db.collection("conversations").doc(conversationId).update({
                status: "processed",
                packageId,
            });
            // Log activity
            await db.collection("activityLogs").add({
                packageId,
                action: "package_created",
                performedBy: "batch-processor",
                timestamp: new Date(),
                details: `Created from ${imageMessages.length} screenshots via WhatsApp`,
            });
            res.status(200).json({
                success: true,
                packageId,
                packageNumber,
                trackingNumbers: allTrackingNumbers,
                items: allItems,
                totalValue,
                totalFees,
                googleDocUrl: docUrl,
                message: "Batch processing completed successfully",
            });
        }
        catch (error) {
            console.error("Error processing batch:", error);
            res.status(500).json({
                error: "Failed to process batch",
                details: error.message,
            });
        }
    });
});
// Helper functions for legacy endpoints
async function findActiveConversation(senderPhone) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const snapshot = await db.collection("conversations")
        .where("senderPhone", "==", senderPhone)
        .where("status", "==", "active")
        .where("lastMessageAt", ">=", tenMinutesAgo)
        .orderBy("lastMessageAt", "desc")
        .limit(1)
        .get();
    if (!snapshot.empty) {
        return Object.assign({ id: snapshot.docs[0].id }, snapshot.docs[0].data());
    }
    return null;
}
function extractCustomerName(text) {
    if (!text)
        return null;
    // Remove common prefixes and clean up
    const cleaned = text
        .replace(/^(customer|cliente|name|nombre):\s*/i, "")
        .trim();
    // Basic validation: should have at least first and last name
    const words = cleaned.split(/\s+/);
    if (words.length >= 2 && cleaned.length <= 100) {
        return cleaned;
    }
    return null;
}
async function checkAndMarkConversationReady(conversationId) {
    const convDoc = await db.collection("conversations").doc(conversationId).get();
    const conv = convDoc.data();
    if (conv &&
        conv.extractedCustomerName &&
        conv.imageCount > 0 &&
        conv.status === "active") {
        await db.collection("conversations").doc(conversationId).update({
            status: "ready",
        });
    }
}
async function findOrCreateCustomer(phone, name, importerId) {
    const snapshot = await db.collection("customers")
        .where("phone", "==", phone)
        .where("importerId", "==", importerId)
        .limit(1)
        .get();
    if (!snapshot.empty) {
        return Object.assign({ id: snapshot.docs[0].id }, snapshot.docs[0].data());
    }
    // Create new customer
    const customerRef = await db.collection("customers").add({
        name,
        phone,
        importerId,
        createdAt: new Date(),
    });
    return { id: customerRef.id, name, phone, importerId };
}
//# sourceMappingURL=index-old-backup.js.map