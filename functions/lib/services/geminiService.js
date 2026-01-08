"use strict";
/**
 * Gemini AI Service
 * Analyzes order screenshots using Google Gemini
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeOrderScreenshot = void 0;
const generative_ai_1 = require("@google/generative-ai");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
/**
 * Analyze order screenshot (Amazon, eBay, AliExpress, etc.)
 * Extracts tracking numbers, items, quantities, prices
 */
const analyzeOrderScreenshot = async (base64Image) => {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `You are analyzing an online shopping order screenshot (Amazon, eBay, AliExpress, Shein, etc).

IMPORTANT: This is an ORDER CONFIRMATION or SHOPPING CART screenshot, not a shipped package label.

Extract the following information:
1. Tracking number (if visible - may not be available yet if order just placed)
2. Order number (order ID, confirmation number)
3. Seller/Store name (Amazon, eBay seller name, etc.)
4. Order date (when order was placed)
5. List of ALL items with:
   - Product name (full name as shown)
   - Quantity ordered
   - Price per unit in USD (if different currency, convert to USD estimate)
   - Total price for that item (quantity × unit price)
   - Brief description if available
6. Order total (grand total for entire order)

Return data in this EXACT JSON format:
{
  "trackingNumber": "tracking number if visible, otherwise null",
  "orderNumber": "order/confirmation number or null",
  "seller": "store/seller name or null",
  "orderDate": "YYYY-MM-DD format or null",
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
- Return ONLY the JSON object, no other text

Return ONLY valid JSON.`;
    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                mimeType: "image/png",
                data: base64Image,
            },
        },
    ]);
    const responseText = result.response.text();
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