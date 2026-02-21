/**
 * Command Handlers (Updated for simplified WhatsApp integration)
 * Handle /status and /help commands
 */

import {getFirestore} from "firebase-admin/firestore";
import {sendWhatsAppMessage} from "../services/twilioService";

// Lazy load db to avoid initialization issues
const getDb = () => getFirestore();

/**
 * Handle /status command (simplified - shows pending orders)
 */
export async function handleStatusCommand(
  senderPhone: string,
  args: string[]
): Promise<void> {
  // Find user by phone
  const usersSnapshot = await getDb().collection("users")
    .where("whatsappPhone", "==", senderPhone)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    await sendWhatsAppMessage(
      senderPhone,
      `❌ Phone number not registered\n\nPlease link your WhatsApp in the ImportFlow app.`
    );
    return;
  }

  const user = {id: usersSnapshot.docs[0].id, ...usersSnapshot.docs[0].data()} as any;

  // Get pending orders count
  const pendingOrdersSnapshot = await getDb().collection("orders")
    .where("organizationId", "==", user.organizationId)
    .where("status", "==", "pending-review")
    .get();

  const pendingCount = pendingOrdersSnapshot.size;

  if (pendingCount === 0) {
    await sendWhatsAppMessage(
      senderPhone,
      `✅ No pending orders\n\nAll orders have been reviewed!\n\nSend customer name + screenshots to create new orders.`
    );
    return;
  }

  // Group by customer
  const ordersByCustomer = new Map<string, number>();
  pendingOrdersSnapshot.docs.forEach((doc) => {
    const order = doc.data();
    const customerName = order.customerName || "Unknown";
    ordersByCustomer.set(customerName, (ordersByCustomer.get(customerName) || 0) + 1);
  });

  // Build message
  const customerList = Array.from(ordersByCustomer.entries())
    .map(([name, count]) => `• ${name}: ${count} order${count > 1 ? "s" : ""}`)
    .join("\n");

  await sendWhatsAppMessage(
    senderPhone,
    `📊 Pending Orders: ${pendingCount}\n\n${customerList}\n\nReview in the ImportFlow app to assign to docs.`
  );
}

/**
 * Handle /help command
 */
export async function handleHelpCommand(
  senderPhone: string,
  args: string[]
): Promise<void> {
  const helpText = `📱 *ImportFlow WhatsApp*

━━━━━━━━━━━━━━━━━━━━

*How to Add Orders:*

1️⃣  Send customer name

2️⃣  Send order screenshot

3️⃣  Done! Order appears in your app

━━━━━━━━━━━━━━━━━━━━

*What Happens:*

✅  AI extracts order details
✅  Sequential package number assigned
✅  Order added to Order Management

━━━━━━━━━━━━━━━━━━━━

💡 *Tip:* Send name and screenshot together for fastest processing

━━━━━━━━━━━━━━━━━━━━

Questions? importflow-app.web.app`;

  await sendWhatsAppMessage(senderPhone, helpText);
}

// Export placeholder for /export command (removed from WhatsApp)
export async function handleExportCommand(
  senderPhone: string,
  args: string[],
  options: Record<string, string>
): Promise<void> {
  await sendWhatsAppMessage(
    senderPhone,
    `📱 Export via Web App\n\nPlease use the ImportFlow web app to export docs.\n\nWhatsApp is for uploading screenshots only.`
  );
}
