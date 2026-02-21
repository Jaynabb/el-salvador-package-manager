/**
 * Firebase Cloud Functions
 * WhatsApp Integration - Complete Bridge to ImportFlow App
 */

import {onRequest} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import cors from "cors";
import {parseCommand, isValidCommand} from "./utils/commandParser";
import {
  sendWhatsAppMessage,
  validateTwilioSignature,
  extractPhoneNumber,
} from "./services/twilioService";
import {
  handleHelpCommand,
} from "./handlers/commandHandlers";
import {analyzeOrderScreenshot} from "./services/geminiService";

const corsHandler = cors({origin: true});

// Initialize Firebase Admin with correct storage bucket
initializeApp({
  storageBucket: "el-salvador-package-manager.firebasestorage.app",
});
const db = getFirestore();
const storage = getStorage();

/**
 * User session data (in-memory storage for active conversations)
 * In production, consider using Firestore or Redis for persistence
 */
const userSessions = new Map<string, {
  currentCustomerName: string | null;
  lastActivity: number;
  errorSent: boolean;
  lastErrorTime: number;
  pendingScreenshots: Array<{
    imageBytes: Buffer;
    mediaContentType: string;
    receivedAt: number;
  }>;
}>();

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
 * Get next sequential package number
 */
async function getNextPackageNumber(organizationId: string): Promise<string> {
  try {
    // Get all orders sorted by creation date to find the latest package number
    const ordersSnapshot = await db.collection("organizations")
      .doc(organizationId)
      .collection("orders")
      .orderBy("createdAt", "desc")
      .limit(50) // Check last 50 orders to find highest number
      .get();

    let highestNumber = 0;

    // Find the highest "Paquete #X" number
    ordersSnapshot.docs.forEach((doc) => {
      const packageNumber = doc.data().packageNumber;
      if (packageNumber && typeof packageNumber === "string") {
        // Match pattern like "Paquete #28"
        const match = packageNumber.match(/Paquete #(\d+)/i);
        if (match) {
          const num = parseInt(match[1]);
          if (num > highestNumber) {
            highestNumber = num;
          }
        }
      }
    });

    // Increment by 1
    const nextNumber = highestNumber + 1;
    return `Paquete #${nextNumber}`;
  } catch (error) {
    console.error("Error getting next package number:", error);
    // Fallback to timestamp-based number
    return `Paquete #${Date.now()}`;
  }
}

/**
 * Download media from Twilio immediately (before URL expires)
 */
async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }

  const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  console.log(`Downloading media from: ${mediaUrl}`);

  const imageResponse = await fetch(mediaUrl, {
    headers: {
      "Authorization": authHeader,
    },
  });

  if (!imageResponse.ok) {
    const errorBody = await imageResponse.text();
    console.error(`Failed to download media. Status: ${imageResponse.status}, Body: ${errorBody}`);
    throw new Error(`Failed to download media: ${imageResponse.status} ${imageResponse.statusText}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(imageBuffer);
}

/**
 * Process multiple screenshots from a single WhatsApp message and create ONE order
 */
async function processMultipleScreenshots(
  screenshots: Array<{imageBytes: Buffer; mediaContentType: string}>,
  customerName: string,
  user: any,
  senderPhone: string
): Promise<void> {
  const bucket = storage.bucket();
  const downloadUrls: string[] = [];
  const storagePaths: string[] = [];

  console.log(`Processing ${screenshots.length} screenshot(s) for ${customerName}`);

  // Send processing message
  await sendWhatsAppMessage(
    senderPhone,
    `📸 ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""} received for ${customerName}\n\n⏳ Extracting order data...`
  );

  // Upload ALL screenshots to Firebase Storage
  for (let i = 0; i < screenshots.length; i++) {
    const {imageBytes, mediaContentType} = screenshots[i];
    const timestamp = Date.now();
    const fileExtension = getFileExtension(mediaContentType);
    const fileName = `${user.organizationId}/${timestamp}_${i}_${customerName.replace(/\s+/g, "_")}.${fileExtension}`;
    const storagePath = `screenshots/${fileName}`;

    const file = bucket.file(storagePath);

    console.log(`Uploading screenshot ${i + 1}/${screenshots.length} to: ${storagePath}`);

    await file.save(imageBytes, {
      metadata: {
        contentType: mediaContentType,
        metadata: {
          customerName,
          uploadedBy: user.id,
          organizationId: user.organizationId,
          source: "whatsapp",
          uploadedAt: new Date().toISOString(),
          screenshotIndex: i.toString(),
        },
      },
    });

    // Make file publicly readable and get download URL
    await file.makePublic();
    const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    downloadUrls.push(downloadUrl);
    storagePaths.push(storagePath);
  }

  console.log(`All ${screenshots.length} screenshots uploaded successfully`);

  // Extract data with Gemini AI from FIRST screenshot
  // (We could potentially analyze all and merge data, but for now use first)
  const firstScreenshot = screenshots[0];
  const base64 = firstScreenshot.imageBytes.toString("base64");

  console.log(`Starting AI extraction for ${customerName}, content-type: ${firstScreenshot.mediaContentType}`);
  const extractedData = await analyzeOrderScreenshot(base64, firstScreenshot.mediaContentType);

  console.log(`Extracted data:`, extractedData);

  // Calculate total pieces from items
  const totalPieces = extractedData.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

  // Get next sequential package number
  const packageNumber = await getNextPackageNumber(user.organizationId);
  console.log(`Assigned package number: ${packageNumber}`);

  // Create ONE order in Firestore with ALL screenshot URLs
  const orderData = {
    // OrderManagement table fields
    packageNumber: packageNumber, // Sequential: Paquete #29, #30, etc.
    date: new Date().toISOString().split("T")[0], // Upload date (today), not order date from screenshot
    consignee: customerName, // Customer name
    pieces: totalPieces, // Total item count
    weight: "", // Empty for now (not extracted from screenshots)
    trackingNumber: extractedData.trackingNumber || "",
    merchantTrackingNumber: extractedData.trackingNumber || "",
    orderNumber: extractedData.orderNumber || "",
    company: extractedData.seller || "", // Seller/Store name
    value: extractedData.orderTotal || 0, // Order total
    parcelComp: extractedData.shippingCarrier || "", // Shipping carrier from AI
    carriers: extractedData.shippingCarrier ? [extractedData.shippingCarrier] : [], // Array format
    screenshotUrls: downloadUrls, // ALL screenshot URLs from this message

    // Additional metadata (not in OrderRow but useful)
    customerPhone: senderPhone,
    organizationId: user.organizationId,
    uploadedBy: user.id,
    uploadedByName: user.displayName || user.email,
    imagePath: storagePaths[0], // Primary image path
    imageType: firstScreenshot.mediaContentType,
    items: extractedData.items || [], // Keep item details
    status: "pending-review",
    extractionStatus: "completed",
    source: "whatsapp",
    screenshotCount: screenshots.length, // Track how many screenshots in this order

    // Timestamps
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const orderRef = await db.collection("organizations")
    .doc(user.organizationId)
    .collection("orders")
    .add(orderData);

  console.log(`Order created: ${orderRef.id} with ${screenshots.length} screenshots`);

  // Send success message
  const itemsSummary = extractedData.items?.length > 0 ?
    extractedData.items.map((item: any) =>
      `• ${item.name} (${item.quantity}x) - $${item.totalValue.toFixed(2)}`
    ).join("\n") :
    "No items extracted";

  await sendWhatsAppMessage(
    senderPhone,
    `✅ Order created for ${customerName}\n\n` +
    `📸 ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""} attached\n\n` +
    `${itemsSummary}\n\n` +
    `Total: $${extractedData.orderTotal?.toFixed(2) || "0.00"}\n\n` +
    `📱 Review in ImportFlow app\n` +
    `Status: Pending Review\n\n` +
    `Send more screenshots for ${customerName} or send a new customer name.`
  );
}

/**
 * Twilio WhatsApp Webhook
 * Handles incoming WhatsApp messages and creates orders directly
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
        // Clean old sessions periodically
        cleanOldSessions();

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
        } = req.body;

        const senderPhone = From; // Keep full format: whatsapp:+14072896614
        const messageText = Body?.trim() || "";
        const numMedia = parseInt(NumMedia || "0");

        // Extract ALL media URLs from this message
        const mediaItems: Array<{url: string; contentType: string}> = [];
        for (let i = 0; i < numMedia; i++) {
          const url = req.body[`MediaUrl${i}`];
          const contentType = req.body[`MediaContentType${i}`] || "image/jpeg";
          if (url) {
            mediaItems.push({url, contentType});
          }
        }

        console.log(`WhatsApp message from ${senderPhone}: ${messageText || `${mediaItems.length} media`}`);

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
            case "help":
              await handleHelpCommand(senderPhone, parsed.args);
              break;

            default:
              await sendWhatsAppMessage(
                senderPhone,
                `❓ Unknown command: ${parsed.command}\n\nType /help for instructions.`
              );
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
            pendingScreenshots: [],
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
            await sendWhatsAppMessage(
              senderPhone,
              `❌ Phone number not registered\n\nPlease link your WhatsApp number in the ImportFlow app.\n\nGo to Firestore Console and add:\nField: whatsappPhone\nValue: ${senderPhone}`
            );
            session.errorSent = true;
            session.lastErrorTime = Date.now();
            userSessions.set(senderPhone, session);
          }
          res.status(200).send("OK");
          return;
        }

        // User found - reset error flag
        session.errorSent = false;

        // Handle text WITH media (name + screenshots in same message)
        if (messageText && mediaItems.length > 0) {
          session.currentCustomerName = messageText;

          try {
            // Download ALL media immediately (before URLs expire)
            const screenshots: Array<{imageBytes: Buffer; mediaContentType: string}> = [];

            for (const mediaItem of mediaItems) {
              const imageBytes = await downloadTwilioMedia(mediaItem.url);
              screenshots.push({
                imageBytes,
                mediaContentType: mediaItem.contentType,
              });
            }

            // Process ALL screenshots from this message as ONE order
            await processMultipleScreenshots(
              screenshots,
              messageText,
              user,
              senderPhone
            );

            // Clear all pending buffered screenshots (from previous messages)
            session.pendingScreenshots = [];
            userSessions.set(senderPhone, session);
          } catch (error: any) {
            console.error("Error processing screenshots:", error);
            await sendWhatsAppMessage(
              senderPhone,
              `❌ Error processing screenshots: ${error.message}\n\nPlease try again or contact support if this continues.`
            );
          }

          res.status(200).send("OK");
          return;
        }

        // Handle text only (set customer name)
        if (messageText && mediaItems.length === 0) {
          session.currentCustomerName = messageText;

          // Time-window pairing: Process ONLY screenshots from last 5 seconds
          const now = Date.now();
          const timeWindow = 5 * 1000; // 5 seconds in milliseconds

          const recentScreenshots = session.pendingScreenshots.filter(
            (screenshot) => (now - screenshot.receivedAt) <= timeWindow
          );

          const expiredCount = session.pendingScreenshots.length - recentScreenshots.length;

          if (recentScreenshots.length > 0) {
            await sendWhatsAppMessage(
              senderPhone,
              `✅ Customer name set: ${messageText}\n\n⏳ Processing ${recentScreenshots.length} screenshot${recentScreenshots.length > 1 ? "s" : ""}...` +
              (expiredCount > 0 ? `\n\n⚠️ ${expiredCount} older screenshot${expiredCount > 1 ? "s" : ""} expired (>5s old)` : "")
            );

            try {
              // Process ALL recent screenshots as ONE order
              const screenshots = recentScreenshots.map((pending) => ({
                imageBytes: pending.imageBytes,
                mediaContentType: pending.mediaContentType,
              }));

              await processMultipleScreenshots(
                screenshots,
                messageText,
                user,
                senderPhone
              );
            } catch (error: any) {
              console.error("Error processing buffered screenshots:", error);
              await sendWhatsAppMessage(
                senderPhone,
                `❌ Error processing screenshots: ${error.message}\n\nPlease try again or contact support if this continues.`
              );
            }

            // Clear ALL pending screenshots (recent + expired)
            session.pendingScreenshots = [];
            userSessions.set(senderPhone, session);
          } else {
            // No recent screenshots - just set the customer name
            if (expiredCount > 0) {
              await sendWhatsAppMessage(
                senderPhone,
                `✅ Customer name set: ${messageText}\n\n⚠️ ${expiredCount} buffered screenshot${expiredCount > 1 ? "s were" : " was"} too old (>5s) and expired.\n\nSend new screenshots for this customer.`
              );
              session.pendingScreenshots = [];
            } else {
              await sendWhatsAppMessage(
                senderPhone,
                `✅ Customer name set: ${messageText}\n\nNow send screenshots for this customer.`
              );
            }
          }

          userSessions.set(senderPhone, session);
          res.status(200).send("OK");
          return;
        }

        // Handle media only (no text)
        if (mediaItems.length > 0) {
          // Check if customer name is set
          if (!session.currentCustomerName) {
            try {
              // CRITICAL: Download ALL media IMMEDIATELY before URLs expire
              console.log(`Downloading ${mediaItems.length} media file(s) immediately for buffering...`);

              // Clean up expired screenshots before adding new ones
              const now = Date.now();
              const timeWindow = 5 * 1000; // 5 seconds
              session.pendingScreenshots = session.pendingScreenshots.filter(
                (screenshot) => (now - screenshot.receivedAt) <= timeWindow
              );

              // Download and buffer ALL screenshots from this message
              for (const mediaItem of mediaItems) {
                const imageBytes = await downloadTwilioMedia(mediaItem.url);
                session.pendingScreenshots.push({
                  imageBytes: imageBytes,
                  mediaContentType: mediaItem.contentType,
                  receivedAt: Date.now(),
                });
              }

              userSessions.set(senderPhone, session);

              // Don't send any message - wait for customer name to arrive
              // (WhatsApp sends them as separate messages, name usually arrives immediately after)
              console.log(`${mediaItems.length} screenshot(s) downloaded and buffered for ${senderPhone}, waiting for customer name...`);
            } catch (error: any) {
              console.error("Error downloading media for buffering:", error);
              await sendWhatsAppMessage(
                senderPhone,
                `❌ Error downloading screenshots. Please send customer name first, then the screenshots.`
              );
            }
            res.status(200).send("OK");
            return;
          }

          const customerName = session.currentCustomerName;

          try {
            // Download ALL media and process as ONE order
            const screenshots: Array<{imageBytes: Buffer; mediaContentType: string}> = [];

            for (const mediaItem of mediaItems) {
              const imageBytes = await downloadTwilioMedia(mediaItem.url);
              screenshots.push({
                imageBytes,
                mediaContentType: mediaItem.contentType,
              });
            }

            await processMultipleScreenshots(
              screenshots,
              customerName,
              user,
              senderPhone
            );
          } catch (error: any) {
            console.error("Error processing screenshots:", error);
            await sendWhatsAppMessage(
              senderPhone,
              `❌ Error processing screenshots: ${error.message}\n\nPlease try again or contact support if this continues.`
            );
          }

          res.status(200).send("OK");
          return;
        }

        // Unknown message type
        await sendWhatsAppMessage(
          senderPhone,
          "📱 Send:\n• Customer name (text)\n• Order screenshots (images)\n• /help for commands"
        );

        res.status(200).send("OK");
      } catch (error) {
        console.error("Error handling WhatsApp message:", error);
        await sendWhatsAppMessage(
          extractPhoneNumber(req.body.From),
          `❌ Error processing your message\n\nPlease try again or contact support.`
        ).catch(() => {
          // Ignore error sending error message
        });
        res.status(500).json({error: "Internal server error"});
      }
    });
  }
);

/**
 * Find user by WhatsApp phone number - flexible matching
 * Handles various phone number formats that users might have entered
 */
async function findUserByPhone(phone: string): Promise<any> {
  console.log(`Searching Firestore for user with phone: "${phone}"`);

  // Extract just the digits from the incoming phone (e.g., "whatsapp:+15712688147" -> "15712688147")
  const incomingDigits = phone.replace(/[^\d]/g, "");

  // Try exact match first (fastest)
  let snapshot = await db.collection("users")
    .where("whatsappPhone", "==", phone)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const userData = {id: snapshot.docs[0].id, ...snapshot.docs[0].data()} as any;
    console.log(`✅ User found (exact match): ${userData.email || userData.id}`);
    return userData;
  }

  // No exact match - search all active users and match by digits
  console.log(`No exact match, searching by digits: "${incomingDigits}"`);

  const allUsersSnapshot = await db.collection("users")
    .where("status", "==", "active")
    .get();

  for (const doc of allUsersSnapshot.docs) {
    const userData = doc.data();
    if (userData.whatsappPhone) {
      // Extract digits from stored number
      const storedDigits = userData.whatsappPhone.replace(/[^\d]/g, "");

      // Match if the last 10 digits are the same (handles country code variations)
      const incomingLast10 = incomingDigits.slice(-10);
      const storedLast10 = storedDigits.slice(-10);

      if (incomingLast10 === storedLast10 && incomingLast10.length === 10) {
        console.log(`✅ User found (flexible match): ${userData.email || doc.id}`);
        console.log(`   Incoming: "${phone}" -> digits: ${incomingDigits}`);
        console.log(`   Stored: "${userData.whatsappPhone}" -> digits: ${storedDigits}`);
        return {id: doc.id, ...userData};
      }
    }
  }

  console.log(`❌ No user found with phone matching: "${phone}"`);
  return null;
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  return mimeToExt[mimeType.toLowerCase()] || "jpg";
}
