/**
 * Command Handlers
 * Handle /export, /status, /help commands
 */

import {getFirestore} from "firebase-admin/firestore";
import {sendWhatsAppMessage} from "../services/twilioService";
import {getCommandHelp} from "../utils/commandParser";

// Lazy load db to avoid initialization issues
const getDb = () => getFirestore();

/**
 * Handle /export command
 * /export doc-abc123
 * /export doc-abc123 email:user@example.com
 */
export async function handleExportCommand(
  senderPhone: string,
  args: string[],
  options: Record<string, string>
): Promise<void> {
  // Validate arguments
  if (args.length === 0) {
    await sendWhatsAppMessage(
      senderPhone,
      "❌ Missing doc ID\n\nUsage: /export <doc-id>\nExample: /export doc-abc123"
    );
    return;
  }

  const docId = args[0];

  // Find doc
  const db = getDb();
  const docDoc = await db.collection("docs").doc(docId).get();

  if (!docDoc.exists) {
    await sendWhatsAppMessage(
      senderPhone,
      `❌ Doc not found: ${docId}\n\nMake sure the doc ID is correct.`
    );
    return;
  }

  const doc = {id: docDoc.id, ...docDoc.data()} as any;

  // Check if doc belongs to this user's organization
  // (You can enhance this with organization verification)

  // Check if doc is ready
  if (doc.status !== "ready" && doc.status !== "active") {
    await sendWhatsAppMessage(
      senderPhone,
      `⚠️ Doc not ready for export\n\nDoc: ${doc.customerName || docId}\nStatus: ${doc.status}\n\nPlease process the doc in the web app first.`
    );
    return;
  }

  try {
    // Send processing message
    await sendWhatsAppMessage(
      senderPhone,
      `⏳ Processing export for doc: ${doc.customerName || docId}\n\nThis may take a moment...`
    );

    // Get all orders for this doc
    const ordersSnapshot = await getDb().collection("orders")
      .where("docId", "==", docId)
      .get();

    if (ordersSnapshot.empty) {
      await sendWhatsAppMessage(
        senderPhone,
        `❌ No orders found for doc: ${docId}`
      );
      return;
    }

    const orders = ordersSnapshot.docs.map((orderDoc) => ({
      id: orderDoc.id,
      ...orderDoc.data(),
    }));

    // Calculate totals
    let totalValue = 0;
    let totalOrders = orders.length;
    const customerNames: string[] = [];

    orders.forEach((order: any) => {
      if (order.totalValue) {
        totalValue += order.totalValue;
      }
      if (order.customerName && !customerNames.includes(order.customerName)) {
        customerNames.push(order.customerName);
      }
    });

    // TODO: Create Google Doc export (future enhancement)
    // For now, just send a success message with doc info
    const docUrl = `https://importflow-app.web.app/doc-manager?doc=${docId}`;

    // Update doc status
    await getDb().collection("docs").doc(docId).update({
      status: "exported",
      exportedAt: new Date(),
      exportedVia: "whatsapp",
    });

    // Check if email delivery requested
    if (options.email) {
      await sendWhatsAppMessage(
        senderPhone,
        `✅ Doc Export Complete\n\n📦 Customers: ${customerNames.join(", ")}\n📊 Orders: ${totalOrders}\n💰 Total Value: $${totalValue.toFixed(2)}\n\n📄 View in app: ${docUrl}\n\n📧 Email delivery to ${options.email} is being processed.`
      );
    } else {
      // Send WhatsApp reply
      await sendWhatsAppMessage(
        senderPhone,
        `✅ Doc Export Complete\n\n📦 Customers: ${customerNames.join(", ")}\n📊 Orders: ${totalOrders}\n💰 Total Value: $${totalValue.toFixed(2)}\n\n📄 View in app: ${docUrl}\n\nYour doc is ready to view in the ImportFlow app.`
      );
    }
  } catch (error) {
    console.error("Error exporting doc:", error);
    await sendWhatsAppMessage(
      senderPhone,
      `❌ Failed to export doc\n\nError: ${error}\n\nPlease try again or contact support.`
    );
  }
}

/**
 * Handle /status command
 * /status doc-abc123
 */
export async function handleStatusCommand(
  senderPhone: string,
  args: string[]
): Promise<void> {
  // Validate arguments
  if (args.length === 0) {
    await sendWhatsAppMessage(
      senderPhone,
      "❌ Missing doc ID\n\nUsage: /status <doc-id>\nExample: /status doc-abc123"
    );
    return;
  }

  const docId = args[0];

  // Find doc
  const db = getDb();
  const docDoc = await db.collection("docs").doc(docId).get();

  if (!docDoc.exists) {
    await sendWhatsAppMessage(
      senderPhone,
      `❌ Doc not found: ${docId}\n\nMake sure the doc ID is correct.`
    );
    return;
  }

  const doc = {id: docDoc.id, ...docDoc.data()} as any;

  // Get orders count
  const ordersSnapshot = await db.collection("orders")
    .where("docId", "==", docId)
    .count()
    .get();

  const orderCount = ordersSnapshot.data().count;

  // Format status message
  const statusEmoji = {
    active: "🟡",
    ready: "🟢",
    processing: "⏳",
    exported: "✅",
    completed: "✅",
  };

  const emoji = statusEmoji[doc.status as keyof typeof statusEmoji] || "⚪";

  const message = [
    `${emoji} Doc Status: ${doc.customerName || docId}`,
    "",
    `Status: ${doc.status}`,
    `Orders: ${orderCount}`,
    `Created: ${new Date(doc.createdAt?.toDate?.() || doc.createdAt).toLocaleDateString()}`,
  ];

  if (doc.totalWeight) {
    message.push(`Weight: ${doc.totalWeight} kg`);
  }

  if (doc.status === "ready") {
    message.push("");
    message.push(`✅ Ready to export! Use /export ${docId}`);
  } else if (doc.status === "active") {
    message.push("");
    message.push("⏳ Still collecting orders...");
  } else if (doc.status === "exported") {
    message.push("");
    message.push(`📄 View in app: https://importflow-app.web.app/doc-manager?doc=${docId}`);
  }

  await sendWhatsAppMessage(senderPhone, message.join("\n"));
}

/**
 * Handle /help command
 */
export async function handleHelpCommand(
  senderPhone: string,
  args: string[]
): Promise<void> {
  const specificCommand = args.length > 0 ? args[0] : undefined;
  const helpText = getCommandHelp(specificCommand);

  await sendWhatsAppMessage(senderPhone, helpText);
}
