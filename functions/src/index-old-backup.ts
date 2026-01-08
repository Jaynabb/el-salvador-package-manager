/**
 * Firebase Cloud Functions
 * WhatsApp Integration with Twilio + Slash Commands
 */

import {onRequest} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import cors from "cors";
import {parseCommand, isValidCommand} from "./utils/commandParser";
import {
  sendWhatsAppMessage,
  validateTwilioSignature,
  extractPhoneNumber,
} from "./services/twilioService";
import {
  handleExportCommand,
  handleStatusCommand,
  handleHelpCommand,
} from "./handlers/commandHandlers";
import {analyzeOrderScreenshot} from "./services/geminiService";
import {createBatchDocument} from "./services/googleDocsService";
import {calculateDuty} from "./utils/dutyCalculator";
import {generatePackageNumber} from "./utils/packageNumberGenerator";

const corsHandler = cors({origin: true});

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

/**
 * Twilio WhatsApp Webhook
 * Handles incoming WhatsApp messages directly from Twilio
 */
export const twilioWhatsAppWebhook = onRequest(
  {
    timeoutSeconds: 60,
    memory: "512MiB",
    invoker: "public",
  },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      // Only accept POST requests
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      try {
        // Validate Twilio signature (security)
        const twilioSignature = req.headers["x-twilio-signature"] as string;
        const url = `https://${req.hostname}${req.path}`;

        if (twilioSignature && !validateTwilioSignature(twilioSignature, url, req.body)) {
          console.warn("Invalid Twilio signature");
          res.status(403).send("Forbidden");
          return;
        }

        // Extract Twilio parameters
        const {
          From,
          Body,
          NumMedia,
          MediaUrl0,
          MediaContentType0,
        } = req.body;

        const senderPhone = extractPhoneNumber(From);
        const messageText = Body?.trim() || "";
        const numMedia = parseInt(NumMedia || "0");

        console.log(`WhatsApp message from ${senderPhone}: ${messageText || `${numMedia} media`}`);

        // Check if it's a slash command
        if (messageText.startsWith("/")) {
          const parsed = parseCommand(messageText);

          if (!parsed || !isValidCommand(parsed.command)) {
            await sendWhatsAppMessage(
              senderPhone,
              `❓ Unknown command: ${messageText}\n\nType /help to see available commands.`
            );
            res.status(200).send("OK");
            return;
          }

          // Route to appropriate command handler
          switch (parsed.command) {
            case "export":
              await handleExportCommand(senderPhone, parsed.args, parsed.options);
              break;

            case "status":
              await handleStatusCommand(senderPhone, parsed.args);
              break;

            case "help":
              await handleHelpCommand(senderPhone, parsed.args);
              break;

            default:
              await sendWhatsAppMessage(
                senderPhone,
                `❓ Command not implemented: ${parsed.command}\n\nType /help for available commands.`
              );
          }

          res.status(200).send("OK");
          return;
        }

        // Not a command - handle as regular message or image
        // Find or create importer by phone
        const importer = await findImporterByPhone(senderPhone);
        const importerId = importer?.id || "default";

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

          await sendWhatsAppMessage(
            senderPhone,
            `✅ Customer name set: ${messageText}\n\nSend screenshots now.\n\nBatch ID: ${batch.id}`
          );

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
            screenshotIds: FieldValue.arrayUnion(screenshotRef.id),
            screenshotCount: FieldValue.increment(1),
            updatedAt: new Date(),
          });

          // Extract data in background (don't wait)
          extractScreenshotDataAsync(screenshotRef.id, base64);

          await sendWhatsAppMessage(
            senderPhone,
            `✅ Screenshot ${batch.screenshotCount + 1} received!\n\n` +
            `Batch: ${batch.customerName || "No name yet"}\n` +
            `Batch ID: ${batch.id}\n\n` +
            `Send more screenshots or use:\n` +
            `/export ${batch.id} - to export\n` +
            `/status ${batch.id} - to check status`
          );

          res.status(200).send("OK");
          return;
        }

        // Unknown message type
        await sendWhatsAppMessage(
          senderPhone,
          "📱 Send me:\n• Text message with customer name\n• Order screenshots\n• Commands like /help, /export, /status"
        );

        res.status(200).send("OK");
      } catch (error) {
        console.error("Error handling WhatsApp message:", error);
        res.status(500).json({error: "Internal server error"});
      }
    });
  }
);

/**
 * Extract screenshot data asynchronously
 */
async function extractScreenshotDataAsync(screenshotId: string, base64: string) {
  try {
    await db.collection("screenshots").doc(screenshotId).update({
      extractionStatus: "processing",
    });

    const extracted = await analyzeOrderScreenshot(base64);

    await db.collection("screenshots").doc(screenshotId).update({
      extractedData: extracted,
      extractionStatus: "completed",
      processedAt: new Date(),
    });

    console.log(`Screenshot ${screenshotId} extracted successfully`);
  } catch (error) {
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
async function findImporterByPhone(phone: string): Promise<any> {
  const snapshot = await db.collection("importers")
    .where("phone", "==", phone)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
  }

  return null;
}

/**
 * Get active batch for importer
 */
async function getActiveBatch(importerId: string): Promise<any> {
  const snapshot = await db.collection("batches")
    .where("importerId", "==", importerId)
    .where("status", "==", "active")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
  }

  return null;
}

/**
 * LEGACY ENDPOINT: Receive WhatsApp Message from Make.com
 * (Keep for backward compatibility)
 */
export const receiveWhatsAppMessage = onRequest(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).json({error: "Method not allowed. Use POST."});
        return;
      }

      try {
        const {senderPhone, messageType, textContent, imageBase64, imageType} = req.body;

        if (!senderPhone || !messageType) {
          res.status(400).json({
            error: "Missing required fields: senderPhone and messageType",
          });
          return;
        }

        console.log(`Received ${messageType} message from ${senderPhone}`);

        // Find or create importer by phone
        const importer = await findImporterByPhone(senderPhone);
        const importerId = importer?.id || "default";

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
        const messageData: any = {
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
        const updateData: any = {
          messageIds: FieldValue.arrayUnion(messageRef.id),
          lastMessageAt: now,
        };

        if (messageType === "image") {
          updateData.imageCount = FieldValue.increment(1);
        } else if (messageType === "text") {
          updateData.textCount = FieldValue.increment(1);

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
      } catch (error: any) {
        console.error("Error receiving message:", error);
        res.status(500).json({
          error: "Failed to receive message",
          details: error.message,
        });
      }
    });
  }
);

/**
 * LEGACY ENDPOINT: Process Batch Screenshots
 * (Keep for backward compatibility)
 */
export const processBatchScreenshots = onRequest(
  {
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).json({error: "Method not allowed. Use POST."});
        return;
      }

      try {
        const {conversationId, customerName: providedName} = req.body;

        if (!conversationId) {
          res.status(400).json({error: "Missing conversationId"});
          return;
        }

        // Get conversation
        const convDoc = await db.collection("conversations").doc(conversationId).get();
        if (!convDoc.exists) {
          res.status(404).json({error: "Conversation not found"});
          return;
        }

        const conversation = {id: convDoc.id, ...convDoc.data()} as any;

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
          res.status(400).json({error: "No unprocessed images found in conversation"});
          return;
        }

        const imageMessages = messagesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as any[];

        console.log(`Processing ${imageMessages.length} screenshots for ${customerName}`);

        // Process each screenshot with Gemini AI
        const extractedDataArray: any[] = [];

        for (const message of imageMessages) {
          try {
            if (!message.imageBase64) {
              console.error(`Missing imageBase64 for message ${message.id}`);
              extractedDataArray.push({items: []});
              continue;
            }

            const extracted = await analyzeOrderScreenshot(message.imageBase64);
            extractedDataArray.push(extracted);
          } catch (error) {
            console.error(`Failed to analyze screenshot ${message.id}:`, error);
            extractedDataArray.push({items: []}); // Add empty to maintain array length
          }
        }

        // Combine all data
        const allTrackingNumbers = extractedDataArray
          .map((d) => d.trackingNumber)
          .filter((t: any) => Boolean(t));

        const allItems = extractedDataArray.flatMap((d) => d.items || []);

        const totalValue = allItems.reduce(
          (sum: number, item: any) => sum + (item.totalValue || 0),
          0
        );

        // Calculate customs duties
        const {duty, vat, totalFees} = calculateDuty(totalValue, allItems);

        // Generate package number
        const packageNumber = await generatePackageNumber();

        // Find or create customer
        const customer = await findOrCreateCustomer(
          conversation.senderPhone,
          customerName,
          conversation.importerId
        );

        // Create package record
        const packageData: any = {
          packageNumber,
          trackingNumbers: allTrackingNumbers,
          customerId: customer.id,
          customerName,
          customerPhone: conversation.senderPhone,
          items: allItems,
          totalValue,
          screenshotCount: imageMessages.length,
          screenshotIds: imageMessages.map((m) => m.id).filter((id: any) => Boolean(id)),
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
        const docUrl = await createBatchDocument({...packageData, id: packageId});

        // Update package with doc URL
        await packageRef.update({documentUrls: [docUrl]});

        // Mark all messages as processed
        const batch = db.batch();
        for (const message of imageMessages) {
          if (!message.id) continue;

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
      } catch (error: any) {
        console.error("Error processing batch:", error);
        res.status(500).json({
          error: "Failed to process batch",
          details: error.message,
        });
      }
    });
  }
);

// Helper functions for legacy endpoints

async function findActiveConversation(senderPhone: string): Promise<any> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const snapshot = await db.collection("conversations")
    .where("senderPhone", "==", senderPhone)
    .where("status", "==", "active")
    .where("lastMessageAt", ">=", tenMinutesAgo)
    .orderBy("lastMessageAt", "desc")
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
  }

  return null;
}

function extractCustomerName(text: string | undefined): string | null {
  if (!text) return null;

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

async function checkAndMarkConversationReady(conversationId: string) {
  const convDoc = await db.collection("conversations").doc(conversationId).get();
  const conv = convDoc.data();

  if (
    conv &&
    conv.extractedCustomerName &&
    conv.imageCount > 0 &&
    conv.status === "active"
  ) {
    await db.collection("conversations").doc(conversationId).update({
      status: "ready",
    });
  }
}

async function findOrCreateCustomer(
  phone: string,
  name: string,
  importerId: string
): Promise<any> {
  const snapshot = await db.collection("customers")
    .where("phone", "==", phone)
    .where("importerId", "==", importerId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
  }

  // Create new customer
  const customerRef = await db.collection("customers").add({
    name,
    phone,
    importerId,
    createdAt: new Date(),
  });

  return {id: customerRef.id, name, phone, importerId};
}
