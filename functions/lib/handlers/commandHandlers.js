"use strict";
/**
 * Command Handlers (Updated for simplified WhatsApp integration)
 * Handle /status and /help commands
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStatusCommand = handleStatusCommand;
exports.handleHelpCommand = handleHelpCommand;
exports.handleExportCommand = handleExportCommand;
const firestore_1 = require("firebase-admin/firestore");
const twilioService_1 = require("../services/twilioService");
// Lazy load db to avoid initialization issues
const getDb = () => (0, firestore_1.getFirestore)();
/**
 * Handle /status command (simplified - shows pending orders)
 */
async function handleStatusCommand(senderPhone, args) {
    // Find user by phone
    const usersSnapshot = await getDb().collection("users")
        .where("whatsappPhone", "==", senderPhone)
        .where("status", "==", "active")
        .limit(1)
        .get();
    if (usersSnapshot.empty) {
        await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `❌ Phone number not registered\n\nPlease link your WhatsApp in the ImportFlow app.`);
        return;
    }
    const user = Object.assign({ id: usersSnapshot.docs[0].id }, usersSnapshot.docs[0].data());
    // Get pending orders count
    const pendingOrdersSnapshot = await getDb().collection("orders")
        .where("organizationId", "==", user.organizationId)
        .where("status", "==", "pending-review")
        .get();
    const pendingCount = pendingOrdersSnapshot.size;
    if (pendingCount === 0) {
        await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `✅ No pending orders\n\nAll orders have been reviewed!\n\nSend customer name + screenshots to create new orders.`);
        return;
    }
    // Group by customer
    const ordersByCustomer = new Map();
    pendingOrdersSnapshot.docs.forEach((doc) => {
        const order = doc.data();
        const customerName = order.customerName || "Unknown";
        ordersByCustomer.set(customerName, (ordersByCustomer.get(customerName) || 0) + 1);
    });
    // Build message
    const customerList = Array.from(ordersByCustomer.entries())
        .map(([name, count]) => `• ${name}: ${count} order${count > 1 ? "s" : ""}`)
        .join("\n");
    await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `📊 Pending Orders: ${pendingCount}\n\n${customerList}\n\nReview in the ImportFlow app to assign to docs.`);
}
/**
 * Handle /help command
 */
async function handleHelpCommand(senderPhone, args) {
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
    await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, helpText);
}
// Export placeholder for /export command (removed from WhatsApp)
async function handleExportCommand(senderPhone, args, options) {
    await (0, twilioService_1.sendWhatsAppMessage)(senderPhone, `📱 Export via Web App\n\nPlease use the ImportFlow web app to export docs.\n\nWhatsApp is for uploading screenshots only.`);
}
//# sourceMappingURL=commandHandlers.js.map