/**
 * Gemini AI Service
 * Analyzes order screenshots using Google Gemini
 */

import {GoogleGenerativeAI, HarmCategory, HarmBlockThreshold} from "@google/generative-ai";
import Tesseract from "tesseract.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * OCR fallback when Gemini vision blocks due to RECITATION
 * Extracts text from image, then sends to Gemini text model
 */
const extractWithOCR = async (base64Image: string): Promise<string> => {
  console.log("🔍 Running OCR fallback to extract text from image...");

  try {
    // Convert base64 to data URL if needed
    const imageData = base64Image.startsWith("data:")
      ? base64Image
      : `data:image/png;base64,${base64Image}`;

    const result = await Tesseract.recognize(imageData, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const text = result.data.text;
    console.log("✓ OCR extracted text:", text.substring(0, 200) + "...");
    return text;
  } catch (error) {
    console.error("OCR extraction failed:", error);
    throw new Error("Failed to extract text from image using OCR");
  }
};

interface ExtractedOrderData {
  trackingNumber?: string | null;
  orderNumber?: string | null;
  seller?: string | null;
  orderDate?: string | null;
  shippingCarrier?: string | null;
  items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unitValue: number;
    totalValue: number;
    category: string;
  }>;
  orderTotal?: number | null;
  notAnOrder?: boolean;
}

/**
 * Analyze order screenshot (Amazon, eBay, AliExpress, etc.)
 * Extracts tracking numbers, items, quantities, prices
 */
export const analyzeOrderScreenshot = async (
  base64Image: string,
  mimeType: string = "image/jpeg"
): Promise<ExtractedOrderData> => {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 1.0,
      candidateCount: 1,
      responseMimeType: 'application/json',
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

You are analyzing an online shopping order screenshot from Shein, Amazon, eBay, AliExpress, Temu,
or similar e-commerce sites. Screenshots may be from mobile app, mobile web, or desktop web in
English or Spanish (typically Latin American Spanish).

🔴 🔴 🔴 STEP 0 — CLASSIFY THE SCREENSHOT (but ALWAYS extract visible items) 🔴 🔴 🔴

ALWAYS extract every item with a visible product name + price, regardless of screenshot type.
NEVER return an empty items list to "reject" a screenshot — the customer uploaded it for a reason
and missing line items will cause downstream customs totals to be wrong.

After extracting, CLASSIFY whether the screenshot looks like a placed order by checking for ANY of:
  - Shipping address visible (street + city + state, e.g. "7024 NW 50TH ST", "Miami FLORIDA",
    "Flylog", "FLYLOG")
  - Order status: "Entregado", "Enviado", "Salida del almacén", "Delivered", "Shipped",
    "Out for delivery", "In transit"
  - Order header: "Detalles del pedido", "Detalles de Pedido", "DETALLES DE PEDIDO",
    "Order details", "Información de pedido", "Your Order"
  - Order number explicitly labeled: "Núm. de pedido", "N.º de pedido", "Order #", "Order number"
  - Carrier/transportista panel: "Transportista", "GOFO", "YunExpress", "USPS"

If NONE of those signals are present (e.g. screenshot is a cart preview, product detail page,
search result, wishlist, or shopping ad), set "notAnOrder": true in your response — but STILL
extract every item + price visible. Downstream review will confirm intent.
If any signal IS present, set "notAnOrder": false.

NEVER extract items from these regions of a screenshot (they are not part of the customer's order):
  - "También te puede gustar" / "You may also like" / "Recommended for you" / "Más" recommendations
  - "Pulse para ver los detalles del envío conjunto" sections (bundled-shipping promos)
  - Sponsored/advertisement banners

Extract the following information:
1. Tracking number (if visible - may not be available yet if order just placed)
2. Order number (order ID, confirmation number)
3. Seller/Store name (Amazon, eBay seller name, etc.)
4. Order date (when order was placed)
5. Shipping carrier (USPS, UPS, FedEx, DHL, YunExpress, GOFO, OnTrac, LaserShip, etc. - extract if visible. GOFO is a common LATAM freight forwarder appearing as an orange box logo with "GOFO" text in Shein orders.)
6. List of ALL items with:
   - Product name (full name as shown)
   - Quantity ordered
   - Price per unit in USD (CRITICAL: Use sale price if item is on sale - use the LOWEST price shown, NOT crossed-out original price)
   - Total price for that item (quantity × unit price using sale price)
   - Brief description if available
7. Order total - CRITICALLY IMPORTANT:
   - Extract the PRODUCTS SUBTOTAL (orange/colored number or "Productos" label) as DEFAULT
   - This is the sum of product prices BEFORE discounts/coupons
   - On Shein: the ORANGE/colored number near the top
   - On Amazon: labeled "Productos: $XX"
   - ONLY fall back to the final "Total" if no products subtotal is visible
   - NEVER use crossed-out/strikethrough numbers

   🔴 🔴 🔴 CRITICAL: USE THE ORANGE/PRODUCTS SUBTOTAL AS DEFAULT. ONLY FALL BACK TO BLACK TOTAL IF NO ORANGE NUMBER EXISTS. 🔴 🔴 🔴

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
   - Orange/colored number at top (e.g., $45.99) = Products subtotal → USE THIS AS DEFAULT
   - Black "Total" text at bottom (e.g., $40.99) = Final total after discount → ONLY use if NO orange number
   - NEVER use crossed-out/strikethrough numbers
   - When you see MULTIPLE total amounts on a Shein screenshot:
     * USE the orange/colored number at the top (products subtotal) — this is DEFAULT
     * IGNORE the black "Total" text at the bottom (post-discount)
     * Only fall back to black total if NO orange/colored number exists

   🔴 AMAZON EDGE CASE (CRITICAL):
   - "Productos: US$68.66" = Products subtotal → USE THIS AS DEFAULT
   - "Total (I.V.A. Incluido): US$67.50" = Final total after discounts → ONLY use if "Productos" not visible
   - DEFAULT: Use "Productos" amount (sum of product prices)

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
  "shippingCarrier": "USPS|UPS|FedEx|DHL|YunExpress|GOFO|OnTrac|LaserShip|other or null",
  "items": [
    {
      "name": "full product name as shown on screenshot",
      "description": "brief description or null",
      "customsDescription": "SHORT customs description in Spanish (3-5 words max): item type + color ONLY. NO brand names, NO marketing text, NO sizes. Examples: 'Calzoncillos Boxer Negro', 'Vestido Rojo Mujer', 'Consola Juegos Portátil', 'Camiseta Blanca Mujer'. If screenshot is in English, translate to Spanish.",
      "quantity": number,
      "unitValue": number (price per unit in USD),
      "totalValue": number (quantity × unitValue),
      "category": "electronics|clothing|toys|food|accessories|other"
    }
  ],
  "orderTotal": number (grand total in USD) or null,
  "notAnOrder": boolean (true if screenshot lacks order signals like shipping address, order status, order number, etc. — flag only, do NOT use this to skip extraction)
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
✓ Step E: Is there an orange/colored number or "Productos" subtotal?
  - If YES → USE IT as orderTotal (products subtotal is our default)
  - Orange $45.99 vs Black "Total" $40.99 → USE $45.99 (ORANGE/products subtotal)
  - "Productos" $68.66 vs "Total I.V.A." $67.50 → USE $68.66 (Productos)
  - SHEIN: Orange at top vs Black "Total" at bottom → USE ORANGE
  - AMAZON: "Productos" vs "Total (I.V.A. Incluido)" → USE "Productos"
✓ Step F: Only fall back to black/bottom total if NO orange/products number exists. NEVER use crossed-out numbers!

🔴 CRITICAL: orderTotal should be the ORANGE/products subtotal if visible. Only fall back to black total if no orange number exists!
🔴 SHEIN: Use the ORANGE number at top (default). Only use black "Total" at bottom if no orange number!
🔴 AMAZON: Use "Productos" (default). Only use "Total (I.V.A. Incluido)" if "Productos" not visible!

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
  const candidate = result.response.candidates?.[0];
  let responseText = "";

  // Check for RECITATION flag FIRST
  const isRecitationBlocked = candidate?.finishReason === "RECITATION";

  if (isRecitationBlocked) {
    // RECITATION detected - try to extract from candidate (don't call .text())
    console.warn("⚠️ RECITATION detected - attempting direct extraction for customs declaration purposes");

    const partialText = candidate?.content?.parts?.[0]?.text;
    if (partialText && partialText.trim().length > 0) {
      responseText = partialText;
      console.log("✓ Successfully extracted partial response despite RECITATION block");
    } else {
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
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
          generationConfig: {
            temperature: 0,
            topP: 1.0,
            candidateCount: 1,
            responseMimeType: 'application/json',
          },
        });

        // Same prompt but adapted for text input
        const textPrompt = `${prompt}\n\nHere is the extracted text from an order screenshot:\n\n${ocrText}\n\nPlease extract the order data and return ONLY valid JSON in the format specified above.`;

        const textResult = await textModel.generateContent(textPrompt);
        responseText = textResult.response.text();
        console.log("✓ Successfully structured data from OCR text");
      } catch (ocrError) {
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
  } else {
    // No RECITATION - normal extraction
    responseText = result.response.text();
  }

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = responseText;
  if (jsonText.includes("```json")) {
    jsonText = jsonText.split("```json")[1].split("```")[0].trim();
  } else if (jsonText.includes("```")) {
    jsonText = jsonText.split("```")[1].split("```")[0].trim();
  }

  const parsed = JSON.parse(jsonText);

  // Ensure items have required fields
  if (parsed.items) {
    parsed.items = parsed.items.map((item: any) => ({
      name: item.name || "Unknown Item",
      description: item.description || null,
      customsDescription: item.customsDescription || null,
      quantity: item.quantity || 1,
      unitValue: item.unitValue || 0,
      totalValue: item.totalValue || (item.unitValue || 0) * (item.quantity || 1),
      category: item.category || "other",
    }));
  } else {
    parsed.items = [];
  }

  return parsed;
};
