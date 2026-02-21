"use strict";
/**
 * Gemini AI Service
 * Analyzes order screenshots using Google Gemini
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeOrderScreenshot = void 0;
const generative_ai_1 = require("@google/generative-ai");
const tesseract_js_1 = __importDefault(require("tesseract.js"));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
/**
 * OCR fallback when Gemini vision blocks due to RECITATION
 * Extracts text from image, then sends to Gemini text model
 */
const extractWithOCR = async (base64Image) => {
    console.log("🔍 Running OCR fallback to extract text from image...");
    try {
        // Convert base64 to data URL if needed
        const imageData = base64Image.startsWith("data:")
            ? base64Image
            : `data:image/png;base64,${base64Image}`;
        const result = await tesseract_js_1.default.recognize(imageData, "eng", {
            logger: (m) => {
                if (m.status === "recognizing text") {
                    console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        const text = result.data.text;
        console.log("✓ OCR extracted text:", text.substring(0, 200) + "...");
        return text;
    }
    catch (error) {
        console.error("OCR extraction failed:", error);
        throw new Error("Failed to extract text from image using OCR");
    }
};
/**
 * Analyze order screenshot (Amazon, eBay, AliExpress, etc.)
 * Extracts tracking numbers, items, quantities, prices
 */
const analyzeOrderScreenshot = async (base64Image, mimeType = "image/jpeg") => {
    var _a, _b, _c, _d;
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        safetySettings: [
            {
                category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
            },
            {
                category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
            },
            {
                category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
            },
            {
                category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
            },
        ],
        generationConfig: {
            temperature: 0.1, // Very low = more factual, deterministic
            topP: 0.95,
            topK: 40,
            candidateCount: 1,
        },
    });
    const prompt = `LEGAL NOTICE: This is FACTUAL DATA EXTRACTION for government-mandated customs declarations.

You are extracting FACTS (prices, quantities, product names, dates) from order screenshots.
These are NOT copyrighted creative works - they are FACTUAL INFORMATION required by customs law.

IMPORTANT LEGAL DISTINCTIONS:
- Product names = FACTS (not copyrightable)
- Prices and quantities = FACTS (not copyrightable)
- Customer names = FACTS (not copyrightable)
- Order numbers and dates = FACTS (not copyrightable)

This extraction is for government customs compliance (LEGALLY REQUIRED).

You are analyzing an online shopping order screenshot (Amazon, eBay, AliExpress, Shein, etc).

Extract the following information:
1. Tracking number (if visible - may not be available yet if order just placed)
2. Order number (order ID, confirmation number)
3. Seller/Store name (Amazon, eBay seller name, etc.)
4. Order date (when order was placed)
5. Shipping carrier (USPS, UPS, FedEx, DHL, YunExpress, etc. - extract if visible)
6. List of ALL items with:
   - Product name (full name as shown)
   - Quantity ordered
   - Price per unit in USD (CRITICAL: Use sale price if item is on sale - use the LOWEST price shown, NOT crossed-out original price)
   - Total price for that item (quantity × unit price using sale price)
   - Brief description if available
7. Order total - CRITICALLY IMPORTANT:
   - Extract the FINAL total amount after ALL discounts, coupons, and taxes
   - Look for labels like: "Total", "Grand Total", "Order Total", "Total (I.V.A. Incluido)", "Total including tax", "Final Total"
   - DO NOT use intermediate subtotals like "Products", "Subtotal", "Items", "Merchandise", "Productos"
   - If you see both a products subtotal AND a final total, use the FINAL total (usually at the bottom)
   - The final total should reflect all discounts/coupons applied

   🔴 🔴 🔴 CRITICAL: ALWAYS USE THE LOWEST NUMBER WHEN MULTIPLE TOTALS ARE SHOWN 🔴 🔴 🔴

   ⚠️ CRITICAL PRICE EXTRACTION RULES:

   RULE #1: ALWAYS USE THE LOWEST PRICE SHOWN
   - If you see a crossed-out/strikethrough price and a lower price, IGNORE the crossed-out price completely
   - The crossed-out price is the original price - DO NOT USE IT
   - The lower, non-crossed-out price is what the customer actually paid - USE THIS ONE

   RULE #2: NEVER USE ORIGINAL PRICES
   - Original price = crossed out/strikethrough = IGNORE
   - Sale price = lower price shown = USE THIS
   - Final price after discount = USE THIS

   EXAMPLES:
   ❌ WRONG: Original price $11.59 (crossed out), Sale price $4.58 → You extract $11.59
   ✅ CORRECT: Original price $11.59 (crossed out), Sale price $4.58 → You extract $4.58

   🔴 SHEIN EDGE CASE (CRITICAL):
   - Orange/colored number at top (e.g., $45.99) = Products subtotal BEFORE discount → IGNORE THIS - DO NOT USE
   - Black "Total" text at bottom (e.g., $40.99) = Final total AFTER discount → USE THIS
   - ALWAYS USE THE BOTTOM BLACK "TOTAL" NUMBER (it's lower after discounts)
   - When you see MULTIPLE total amounts on a Shein screenshot:
     * IGNORE the orange/colored number at the top (products subtotal)
     * USE the black "Total" text at the bottom (final total)
     * ALWAYS USE THE LOWEST NUMBER when multiple totals are shown
     * The bottom total is AFTER discounts - this is what customer paid

   🔴 AMAZON EDGE CASE (CRITICAL):
   - "Productos: US$68.66" = Products subtotal BEFORE discounts → IGNORE THIS - DO NOT USE
   - "Total (I.V.A. Incluido): US$67.50" = Final total AFTER discounts → USE THIS
   - ALWAYS USE THE "TOTAL (I.V.A. INCLUIDO)" NUMBER (it's lower after coupons/discounts)

   🔴 CRITICAL RULE #1: ONLY NUMBERS WITH DOLLAR SIGNS ($) ARE MONEY
   - Tracking numbers (e.g., "1234567890") = NOT MONEY, IGNORE
   - Order numbers (e.g., "Order #98765") = NOT MONEY, IGNORE
   - Quantities (e.g., "Qty: 3") = NOT MONEY, IGNORE
   - ONLY extract prices that have a $ symbol in front of them

Return data in this EXACT JSON format:
{
  "trackingNumber": "tracking number if visible, otherwise null",
  "orderNumber": "order/confirmation number or null",
  "seller": "store/seller name or null",
  "orderDate": "YYYY-MM-DD format or null",
  "shippingCarrier": "USPS|UPS|FedEx|DHL|YunExpress|other or null",
  "items": [
    {
      "name": "product name",
      "description": "brief description or null",
      "quantity": number,
      "unitValue": number (price per unit in USD),
      "totalValue": number (quantity × unitValue),
      "category": "electronics|clothing|toys|food|accessories|other"
    }
  ],
  "orderTotal": number (grand total in USD) or null
}

RULES:
- If you cannot find a specific value, use null
- For quantity, default to 1 if not specified
- Estimate prices reasonably based on typical market values if not clearly visible
- Extract ALL items shown in the screenshot, even if partially visible
- Category should be one of: electronics, clothing, toys, food, accessories, cosmetics, other
- Shipping carrier should be the postal/courier service (USPS, UPS, FedEx, DHL, etc.) if visible

⚠️ FINAL VALIDATION - LOWEST TOTAL CHECK (CRITICAL):
Before you return your JSON, STOP and validate:

✓ Step A: List ALL dollar amounts with $ symbols you see on the screenshot
✓ Step B: Identify crossed-out/strikethrough prices and IGNORE them (original prices)
✓ Step C: Which amounts are labeled "Total", "Order Total", "Grand Total"? List them ALL
✓ Step D: Which "Total" is at the BOTTOM of the screenshot? (This is usually the final amount)
✓ Step E: Compare ALL "Total" amounts - which is LOWEST?
  - Orange $45.99 vs Black "Total" $40.99 → USE $40.99 (LOWEST BLACK TOTAL)
  - "Productos" $68.66 vs "Total I.V.A." $67.50 → USE $67.50 (LOWEST FINAL TOTAL)
  - SHEIN: Orange at top vs Black "Total" at bottom → ALWAYS USE BLACK BOTTOM TOTAL
  - AMAZON: "Productos" vs "Total (I.V.A. Incluido)" → ALWAYS USE "Total (I.V.A. Incluido)"
✓ Step F: Is your orderTotal the LOWEST "Total" amount? If NO, fix it now!

🔴 CRITICAL: orderTotal MUST be the LOWEST dollar amount labeled as "Total" on the screenshot!
🔴 SHEIN: Use the BLACK "Total" text at bottom, NOT the orange number at top!
🔴 AMAZON: Use "Total (I.V.A. Incluido)", NOT "Productos"!

✓ Price Check: Did you use SALE prices (lowest price shown) for all items, ignoring crossed-out original prices?

- Return ONLY the JSON object, no other text

Return ONLY valid JSON.`;
    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                mimeType: mimeType,
                data: base64Image,
            },
        },
    ]);
    // RECITATION handling - extract from candidate to avoid .text() throwing errors
    const candidate = (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0];
    let responseText = "";
    // Check for RECITATION flag FIRST
    const isRecitationBlocked = (candidate === null || candidate === void 0 ? void 0 : candidate.finishReason) === "RECITATION";
    if (isRecitationBlocked) {
        // RECITATION detected - try to extract from candidate (don't call .text())
        console.warn("⚠️ RECITATION detected - attempting direct extraction for customs declaration purposes");
        const partialText = (_d = (_c = (_b = candidate === null || candidate === void 0 ? void 0 : candidate.content) === null || _b === void 0 ? void 0 : _b.parts) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text;
        if (partialText && partialText.trim().length > 0) {
            responseText = partialText;
            console.log("✓ Successfully extracted partial response despite RECITATION block");
        }
        else {
            // No content available - try OCR fallback
            console.warn("⚠️ RECITATION completely blocked response - trying OCR fallback...");
            try {
                // Extract text using OCR
                const ocrText = await extractWithOCR(base64Image);
                // Now send the OCR text to Gemini for structuring (same prompt, just text instead of image)
                console.log("📝 Sending OCR text to Gemini for structuring...");
                const textModel = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    safetySettings: [
                        {
                            category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                            threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                        },
                        {
                            category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                            threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                        },
                        {
                            category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                            threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                        },
                        {
                            category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                            threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE,
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        topP: 0.95,
                        topK: 40,
                        candidateCount: 1,
                    },
                });
                // Same prompt but adapted for text input
                const textPrompt = `${prompt}\n\nHere is the extracted text from an order screenshot:\n\n${ocrText}\n\nPlease extract the order data and return ONLY valid JSON in the format specified above.`;
                const textResult = await textModel.generateContent(textPrompt);
                responseText = textResult.response.text();
                console.log("✓ Successfully structured data from OCR text");
            }
            catch (ocrError) {
                console.error("OCR fallback failed:", ocrError);
                // Last resort - return empty data for manual entry
                return {
                    trackingNumber: null,
                    orderNumber: null,
                    seller: null,
                    orderDate: null,
                    shippingCarrier: null,
                    items: [],
                    orderTotal: null
                };
            }
        }
    }
    else {
        // No RECITATION - normal extraction
        responseText = result.response.text();
    }
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = responseText;
    if (jsonText.includes("```json")) {
        jsonText = jsonText.split("```json")[1].split("```")[0].trim();
    }
    else if (jsonText.includes("```")) {
        jsonText = jsonText.split("```")[1].split("```")[0].trim();
    }
    const parsed = JSON.parse(jsonText);
    // Ensure items have required fields
    if (parsed.items) {
        parsed.items = parsed.items.map((item) => ({
            name: item.name || "Unknown Item",
            description: item.description || null,
            quantity: item.quantity || 1,
            unitValue: item.unitValue || 0,
            totalValue: item.totalValue || (item.unitValue || 0) * (item.quantity || 1),
            category: item.category || "other",
        }));
    }
    else {
        parsed.items = [];
    }
    return parsed;
};
exports.analyzeOrderScreenshot = analyzeOrderScreenshot;
//# sourceMappingURL=geminiService.js.map