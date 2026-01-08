"use strict";
/**
 * Google Docs Service
 * Creates Google Docs for batch exports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBatchDocument = createBatchDocument;
const googleapis_1 = require("googleapis");
const docs = googleapis_1.google.docs("v1");
const drive = googleapis_1.google.drive("v3");
/**
 * Create Google Doc for batch processed package
 * All screenshots from one customer combined into single document
 */
async function createBatchDocument(packageData) {
    try {
        // Authenticate using Application Default Credentials
        const auth = new googleapis_1.google.auth.GoogleAuth({
            scopes: [
                "https://www.googleapis.com/auth/documents",
                "https://www.googleapis.com/auth/drive.file",
            ],
        });
        const authClient = await auth.getClient();
        googleapis_1.google.options({ auth: authClient });
        // Create new Google Doc
        const createResponse = await docs.documents.create({
            requestBody: {
                title: `${packageData.packageNumber} - ${packageData.customerName}`,
            },
        });
        const documentId = createResponse.data.documentId;
        // Build document content
        const requests = buildBatchDocumentRequests(packageData);
        // Apply formatting
        await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests },
        });
        // Make publicly viewable
        await drive.permissions.create({
            fileId: documentId,
            requestBody: {
                role: "reader",
                type: "anyone",
            },
        });
        const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
        console.log(`Created batch Google Doc: ${docUrl}`);
        return docUrl;
    }
    catch (error) {
        console.error("Error creating Google Doc:", error);
        throw new Error(`Failed to create Google Doc: ${error}`);
    }
}
/**
 * Build document requests for batch package
 */
function buildBatchDocumentRequests(packageData) {
    const requests = [];
    let index = 1;
    const addText = (text, bold = false, fontSize = 11) => {
        requests.push({
            insertText: {
                location: { index },
                text,
            },
        });
        if (bold || fontSize !== 11) {
            requests.push({
                updateTextStyle: {
                    range: {
                        startIndex: index,
                        endIndex: index + text.length,
                    },
                    textStyle: {
                        bold,
                        fontSize: { magnitude: fontSize, unit: "PT" },
                    },
                    fields: "bold,fontSize",
                },
            });
        }
        index += text.length;
    };
    // HEADER
    addText("📦 PACKAGE IMPORT ORDER\n\n", true, 18);
    // PACKAGE NUMBER (prominently displayed)
    addText("PACKAGE NUMBER\n", true, 14);
    addText(`${packageData.packageNumber}\n\n`, true, 16);
    // CUSTOMER INFORMATION
    addText("CUSTOMER INFORMATION\n", true, 13);
    addText(`Name: ${packageData.customerName}\n`);
    addText(`Phone: ${packageData.customerPhone}\n`);
    if (packageData.customerEmail) {
        addText(`Email: ${packageData.customerEmail}\n`);
    }
    addText("\n");
    // ORDER DETAILS
    addText("ORDER DETAILS\n", true, 13);
    addText(`Order Date: ${formatDate(packageData.orderDate || packageData.createdAt)}\n`);
    addText(`Status: ${packageData.status.toUpperCase()}\n`);
    addText(`Total Screenshots Processed: ${packageData.screenshotCount}\n`);
    addText("\n");
    // TRACKING NUMBERS
    if (packageData.trackingNumbers && packageData.trackingNumbers.length > 0) {
        addText("TRACKING NUMBERS\n", true, 13);
        packageData.trackingNumbers.forEach((tracking, i) => {
            addText(`${i + 1}. ${tracking}\n`);
        });
        addText("\n");
    }
    // ITEMS (from all screenshots)
    addText("ITEMS ORDERED\n", true, 13);
    addText(`Total Items: ${packageData.items.length}\n\n`, false, 10);
    packageData.items.forEach((item, i) => {
        addText(`${i + 1}. ${item.name}\n`, true, 11);
        if (item.description) {
            addText(`   ${item.description}\n`, false, 10);
        }
        addText(`   Quantity: ${item.quantity}\n`);
        addText(`   Unit Price: $${item.unitValue.toFixed(2)} USD\n`);
        addText(`   Total Price: $${item.totalValue.toFixed(2)} USD\n`, true);
        if (item.category) {
            addText(`   Category: ${item.category}\n`, false, 9);
        }
        addText("\n");
    });
    // FINANCIAL SUMMARY
    addText("FINANCIAL SUMMARY\n", true, 13);
    addText(`Total Order Value: $${packageData.totalValue.toFixed(2)} USD\n`, true, 12);
    addText("\n");
    addText("El Salvador Customs Fees:\n", true, 11);
    addText(`  Customs Duty: $${packageData.customsDuty.toFixed(2)} USD\n`);
    addText(`  VAT (13%): $${packageData.vat.toFixed(2)} USD\n`);
    if (packageData.handlingFee) {
        addText(`  Handling Fee: $${packageData.handlingFee.toFixed(2)} USD\n`);
    }
    addText(`  Total Fees: $${packageData.totalFees.toFixed(2)} USD\n`, true, 11);
    addText("\n");
    addText(`GRAND TOTAL: $${(packageData.totalValue + packageData.totalFees).toFixed(2)} USD\n`, true, 12);
    addText(`Payment Status: ${packageData.paymentStatus.toUpperCase()}\n`, true);
    addText("\n");
    // CUSTOMS DECLARATION
    addText("CUSTOMS DECLARATION\n", true, 13);
    addText(`Declared Value: $${packageData.customsDeclaration.declaredValue.toFixed(2)} USD\n`);
    addText(`Currency: ${packageData.customsDeclaration.currency}\n`);
    addText(`Purpose: ${packageData.customsDeclaration.purpose}\n`);
    if (packageData.customsDeclaration.certificateOfOrigin !== undefined) {
        addText(`Certificate of Origin: ${packageData.customsDeclaration.certificateOfOrigin ? "Yes" : "No"}\n`);
    }
    addText("\n");
    // NOTES
    if (packageData.notes) {
        addText("NOTES\n", true, 13);
        addText(`${packageData.notes}\n\n`);
    }
    // IMPORTANT INFORMATION
    addText("IMPORTANT INFORMATION\n", true, 13);
    addText("• Keep this document for your records\n");
    addText("• Customs fees must be paid before package release\n");
    addText("• Tracking numbers will be active once packages ship\n");
    addText("• Contact us for any questions or concerns\n");
    addText("\n");
    // FOOTER
    addText("─────────────────────────────────\n", false, 9);
    addText(`Document Generated: ${formatDate(new Date())}\n`, false, 9);
    addText(`Package Number: ${packageData.packageNumber}\n`, false, 9);
    addText("ImportFlow Package Manager\n", false, 9);
    return requests;
}
/**
 * Format date to readable string
 */
function formatDate(date) {
    if (!date)
        return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
//# sourceMappingURL=googleDocsService.js.map