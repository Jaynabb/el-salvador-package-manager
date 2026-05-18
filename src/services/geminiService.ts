import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { PackageItem, ExtractedOrderData } from '../types';
import Tesseract from 'tesseract.js';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

/**
 * Retry an async Gemini call with exponential backoff.
 * Retries on rate-limit (429), server errors (5xx), timeouts, and network failures.
 * Non-retryable errors (auth, invalid argument) propagate immediately.
 *
 * Why: client-side Gemini calls from end-user browsers (Julio in El Salvador) hit
 * transient failures that bulk-uploads-from-headquarters never see. Without retry,
 * each failed screenshot drops silently and the doc total varies between runs.
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: { label?: string; maxAttempts?: number } = {}
): Promise<T> => {
  const { label = 'Gemini call', maxAttempts = 3 } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err as any)?.message || String(err);
      const status = (err as any)?.status || (err as any)?.statusCode;
      const isRetryable =
        status === 429 || status === 408 ||
        (typeof status === 'number' && status >= 500 && status < 600) ||
        /rate.?limit|quota|timeout|network|fetch|ECONNRESET|ETIMEDOUT|503|500|429|unavailable|deadline/i.test(msg);

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      console.warn(`⚠️ ${label} attempt ${attempt}/${maxAttempts} failed: ${msg.slice(0, 120)}. Retrying in ${delayMs}ms.`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
};

/**
 * OCR fallback when Gemini vision blocks due to RECITATION
 * Extracts text from image, then sends to Gemini text model
 */
const extractWithOCR = async (base64Image: string): Promise<string> => {
  console.log('🔍 Running OCR fallback to extract text from image...');

  try {
    // Convert base64 to data URL if needed
    const imageData = base64Image.startsWith('data:')
      ? base64Image
      : `data:image/png;base64,${base64Image}`;

    const result = await Tesseract.recognize(imageData, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    const text = result.data.text;
    console.log('✓ OCR extracted text:', text.substring(0, 200) + '...');
    return text;
  } catch (error) {
    console.error('OCR extraction failed:', error);
    throw new Error('Failed to extract text from image using OCR');
  }
};

/**
 * Enhanced MVP Order Screenshot Analyzer
 * Optimized for 95%+ accuracy on e-commerce order screenshots
 * This is the primary function to use for analyzing order screenshots
 */
export const analyzeOrderScreenshot = async (base64Image: string, mimeType: string = 'image/png', lenient: boolean = false): Promise<ExtractedOrderData> => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
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

You are extracting FACTS (prices, quantities, product names, customer names, dates) from order screenshots.
These are NOT copyrighted creative works - they are FACTUAL INFORMATION required by customs law.

IMPORTANT LEGAL DISTINCTIONS:
- Product names = FACTS (not copyrightable)
- Prices and quantities = FACTS (not copyrightable)
- Customer names and addresses = FACTS (not copyrightable)
- Order numbers and dates = FACTS (not copyrightable)

This extraction is for:
1. Government customs compliance (LEGALLY REQUIRED)
2. Import declarations (REGULATORY MANDATE)
3. No commercial republishing (LEGITIMATE USE)

You are an AI assistant extracting factual data for customs declarations in El Salvador.

🌐 LANGUAGE SUPPORT - CRITICAL:
- Screenshots may be in ENGLISH or SPANISH (El Salvador uses Spanish)
- All field labels may appear in either language
- You MUST recognize and extract data regardless of language
- Spanish labels are just as important as English labels

🔴 🔴 🔴 ABSOLUTE RULE - NEVER EXTRACT PHONE NUMBERS AS TRACKING NUMBERS:
- 10-digit numbers = PHONE NUMBERS (never tracking)
- 11-digit numbers starting with 1 = PHONE NUMBERS (never tracking)
- Numbers with dashes/parentheses = PHONE NUMBERS (never tracking)
- If uncertain whether a number is a phone or tracking → DO NOT EXTRACT IT!
- Better to return null than extract a phone number!

CRITICAL ACCURACY REQUIREMENTS:
- Examine the image extremely carefully
- Only extract data you can see clearly - if uncertain, return null
- Double-check all numbers (quantities, prices, tracking)
- Validate calculations before responding
- COUNT THE DIGITS in any tracking number before extracting it!

${lenient ? `🔴 STEP 1: EXTRACT ITEMS FROM THIS SCREENSHOT 🔴

This screenshot comes from a Word document import. Extract ALL product/item information visible.

✅ EXTRACT data from ANY of these screenshot types:
- Order confirmations ("Order Confirmation", "Your Order", etc.)
- Order history / purchase history pages
- Delivered item pages ("ENTREGADO", "Delivered", "Entregado")
- Order details pages ("Ver detalles", "Order Details")
- Product listings with prices (even cart pages or wishlists)
- Any page showing items with names and prices

Only REJECT completely unrelated images:
- Random photos (garage doors, street signs, vehicles, buildings)
- Spreadsheets, calendars, schedules with no product info
- Screenshots of the ImportFlow app itself

If the screenshot shows ANY products with prices, EXTRACT THEM.` : `🔴 🔴 🔴 STEP 1: VERIFY THIS IS AN ACTUAL ORDER CONFIRMATION 🔴 🔴 🔴

BEFORE extracting ANY data, verify this screenshot is an ACTUAL ORDER CONFIRMATION.

✅ VALID screenshots to extract from:
- Order confirmations ("Order Confirmation", "Order Receipt", "Your Order")
- Order history / purchase history pages showing completed orders
- Delivered item pages ("ENTREGADO", "Delivered")
- Order details pages ("Ver detalles", "Order Details")
- Any page showing purchased items with prices from any retailer

❌ REJECT these screenshots (return null/empty data):
- Google Shopping search results (shows "Google Shopping" at top, has "Search" bar)
- Random photos (garage doors, street signs, sidewalks, vehicles, buildings, etc.)
- Websites or apps with NO product/order information
- Spreadsheets, calendars, schedules
- Screenshots of the ImportFlow app itself

🔴 IF THE SCREENSHOT HAS NO ORDER/PRODUCT INFORMATION:
Return this JSON with null/empty values:
{
  "customerName": null,
  "company": null,
  "seller": null,
  "orderNumber": null,
  "orderDate": null,
  "trackingNumber": null,
  "trackingNumberLast4": null,
  "items": [],
  "orderTotal": 0,
  "totalPieces": 0
}`}

✅ PROCEED TO EXTRACT DATA ✅

WHAT TO EXTRACT:

1. **CUSTOMER NAME** (English or Spanish)
   - English labels: "Ship to", "Recipient", "Deliver to", "Customer", "Name"
   - Spanish labels: "Enviar a", "Destinatario", "Entregar a", "Cliente", "Nombre"
   - Look in shipping address section for customer name
   - Return full name exactly as shown
   - If not visible: null

2. **COMPANY/SELLER** - Extract the PLATFORM name, not vendor/seller names on line items.

   This platform handles orders from ANY retailer worldwide. There is NO restricted list.

   STEP 1: Scan for platform text, logos, URLs, or branding anywhere on the screenshot.
   - Look at the header, footer, URL bar, logos, and watermarks
   - Screenshots may be in English, Spanish, or any language

   STEP 2: If no text branding found, identify by visual design (colors, layout, UI patterns).

   STEP 3: Extract the PLATFORM name — the website/app where the order was placed.
   - Capitalize properly (e.g., "Shein" not "SHEIN", "Amazon" not "amazon")
   - If truly unrecognizable → company = null

   🔴 CRITICAL RULE: Extract the PLATFORM, not vendor/seller/brand names on line items.
   - Marketplaces (Amazon, eBay, Shein, Temu, Walmart, AliExpress, etc.) show third-party sellers — IGNORE seller names, extract the marketplace name
   - Example: eBay order from seller "AutoPartsDepot" → company = "eBay" (the platform)
   - Example: Amazon order sold by "BestDeals123" → company = "Amazon" (the platform)
   - Example: Shein order from "Ray's Playhouse" → company = "Shein" (the platform)
   - Direct retailers (Nike.com, BestBuy, HomeDepot, etc.) → use the retailer name
   - Screenshot in Spanish? That's normal for El Salvador - extract data anyway!

3. **ORDER & TRACKING**

   🔴 🔴 🔴 STOP! READ THIS FIRST - PHONE NUMBER WARNING 🔴 🔴 🔴

   BEFORE extracting ANY tracking number, you MUST run this validation:

   ⚠️ PHONE NUMBER VALIDATION CHECKLIST:
   1. Count the digits - Is it exactly 10 digits? → PHONE NUMBER, SKIP IT!
   2. Count the digits - Is it exactly 11 digits starting with "1"? → PHONE NUMBER, SKIP IT!
   3. Does it have format (XXX) XXX-XXXX or XXX-XXX-XXXX? → PHONE NUMBER, SKIP IT!
   4. Does it start with 1-800, 1-888, 1-877, 1-866? → TOLL-FREE PHONE NUMBER, SKIP IT!
   5. Is it near these words: "Phone", "Tel", "Call", "Contact", "Customer Service", "Support", "Help", "Questions?"? → PHONE NUMBER, SKIP IT!
   6. Is it in a "Contact" or "Customer Service" section? → PHONE NUMBER, SKIP IT!

   🔴 ONLY EXTRACT AS TRACKING NUMBER IF:
   - It has 12+ digits (most tracking numbers are longer than phone numbers)
   - OR it starts with "1Z" (UPS format)
   - OR it's 20-22 digits (USPS format)
   - AND it's labeled with words like "Tracking", "Track", "Shipment", "Package"
   - AND it's NOT in a customer service/contact section

   ❌ NEVER EXTRACT THESE AS TRACKING NUMBERS:
   - 10-digit numbers: 5551234567, (555) 123-4567, 555-123-4567
   - 11-digit numbers starting with 1: 18005551234, 1-800-555-1234
   - Numbers near "Call us", "Customer Service", "Contact", "Help", "Support"

   TRACKING NUMBER IDENTIFICATION (only extract if you're 100% sure it's NOT a phone):

   🔴 CRITICAL: Extract ALL tracking numbers from the screenshot (may have multiple packages!)

   - Look for labels (English/Spanish):
     * English: "Tracking", "Tracking Number", "Tracking ID", "Track Package"
     * Spanish: "Número de Seguimiento", "Seguimiento", "Rastreo"

   - Typical tracking formats:
     * USPS: 20-22 digits (e.g., "9400111899562537883145")
     * UPS: Starts with "1Z" + 16 characters (e.g., "1Z999AA10123456784")
     * FedEx: 12-15 digits (e.g., "123456789012")
     * DHL: 10-11 digits (e.g., "1234567890")
     * YunExpress: Various formats

   - 🔴 EXTRACT ALL TRACKING NUMBERS:
     * If screenshot shows multiple packages/shipments → extract ALL tracking numbers!
     * If you see 3 packages with 3 tracking numbers → return all 3!
     * Return as comma-separated string: "9400111899562537883145, 1Z999AA10123456784, 123456789012"

   - 🔴 🔴 🔴 CRITICAL FALLBACK RULE - IF NO TRACKING NUMBER EXISTS:
     * If you CANNOT find a dedicated tracking number on the screenshot
     * BUT you CAN find an ORDER NUMBER (Pedido #, Número de Pedido, Order #, etc.)
     * Then PUT THE ORDER NUMBER in the trackingNumber field!
     * Example: If screenshot shows "Número de pedido: GSU1QY5790028MR" but NO tracking number
     * → Set trackingNumber = "GSU1QY5790028MR"
     * This ensures the system always has a reference number to track the package

   - Examples:
     ✅ Single package with tracking → "9400111899562537883145"
     ✅ Three packages with different tracking → "ABC123, DEF456, GHI789"
     ✅ No tracking but has order number "GSU1QY5790028MR" → "GSU1QY5790028MR"
     ✅ Multiple orders with no tracking → "GSU1QY5790028MR, GSU1QY5790000N8C, GSU1QY5790028MS"
     ❌ No tracking AND no order number → null

   ❌ DO NOT EXTRACT AS TRACKING NUMBERS:
   - **Phone numbers** - Can appear in multiple formats:
     * With dashes: "555-123-4567"
     * With parentheses: "(555) 123-4567"
     * **Plain 10 digits: "5551234567"** ← CRITICAL: This is a phone number, NOT tracking!
     * Toll-free: "1-800-555-1234" or "18005551234"
   - Phone numbers usually appear with labels like: "Phone:", "Contact:", "Call:", "Customer Service:", "Support:", "Questions?", "Help:"
   - **CRITICAL RULE: If a number is exactly 10 or 11 digits and has NO "Tracking" label nearby, it's probably a phone number - SKIP IT!**
   - Dates (like "12/14/2025" or "2025-12-14")
   - Quantities (like "Qty: 3" or "x5")
   - Order totals/prices

   🔴 HOW TO TELL PHONE NUMBER vs TRACKING NUMBER:

   **It's a PHONE NUMBER if:**
   - Exactly 10 digits (e.g., "5551234567")
   - Exactly 11 digits starting with 1 (e.g., "18005551234")
   - Near labels: "Phone", "Contact", "Call", "Customer Service", "Support", "Help"
   - Has dashes or parentheses in 3-3-4 format

   **It's a TRACKING NUMBER if:**
   - 12+ digits (most tracking numbers are longer than phone numbers)
   - Starts with "1Z" (UPS)
   - Near labels: "Tracking", "Track", "Shipment", "Delivery"
   - 20-22 digits (USPS format)

   ✅ CORRECT EXAMPLES:
   - Label: "Tracking: 9400111899562537883145" → Extract: "9400111899562537883145" ✅
   - Label: "Track your order: 1Z999AA10123456784" → Extract: "1Z999AA10123456784" ✅
   - Multiple: "Tracking 1: 123456, Tracking 2: 789012" → Extract: "123456, 789012" ✅

   ❌ WRONG EXAMPLES (DO NOT EXTRACT):
   - Label: "Phone: 555-123-4567" → Skip (phone number)
   - Label: "Contact: (555) 123-4567" → Skip (phone number)
   - Label: "Customer Service: 1-800-555-1234" → Skip (phone number)
   - **Label: "Call us: 5551234567" → Skip (phone number, no formatting)** ← NEW!
   - **Label: "Questions? 8005551234" → Skip (phone number)** ← NEW!
   - **No label near "5551234567" and it's 10 digits → Skip (probably phone)** ← NEW!

   ORDER NUMBER (English or Spanish):
   - English labels: "Order #", "Order Number", "Order ID", "Invoice #"
   - Spanish labels: "Pedido #", "Número de Pedido", "ID de Pedido", "Factura #", "Información de Pedido"
   - Extract full order/invoice number
   - 🔴 CRITICAL: If NO tracking number exists, COPY the order number to BOTH trackingNumber AND orderNumber fields!
   - This ensures mobile and web versions don't error when tracking number is required

   ORDER DATE (English or Spanish):
   - English labels: "Order Date", "Placed on", "Purchase Date"
   - Spanish labels: "Fecha de Pedido", "Realizado el", "Fecha de Compra", "Entrega:"
   - Extract date if visible (format: YYYY-MM-DD or MM/DD/YYYY)
   - Spanish dates may show "ago 19-27" or similar format - extract the date

   LAST 4 DIGITS:
   - Extract last 4 digits of tracking number separately for quick reference

   🔴 SHIPPING CARRIERS - EXTRACT ALL CARRIERS FROM SCREENSHOT:

   ⚠️ CRITICAL: Look for ANY and ALL carrier/shipping company names on the screenshot!
   ⚠️ MULTILINGUAL: Carriers may be labeled in ENGLISH or SPANISH!

   🔴 CARRIER LABELS TO LOOK FOR (in any language):
   - **English**: "Carrier:", "Logistics Provider:", "Shipped via", "Shipping carrier:", "Delivery by"
   - **Spanish**: "Proveedor Logístico:", "Transportista:", "Enviado por", "Empresa de envío:"
   - Look for carrier name AFTER these labels!

   COMMON CARRIERS TO EXTRACT:
   - USPS, UPS, FedEx, DHL
   - Amazon Logistics, Amazon Shipping
   - OnTrac, LaserShip
   - **YunExpress** (Yun Express), **4PX**, **Yanwen**
   - China Post, Singapore Post, Hong Kong Post
   - SF Express, EMS
   - Pitney Bowes
   - APC, Newgistics
   - **ANY other shipping/logistics company name you see**

   🔴 HOW TO FIND CARRIERS (STEP BY STEP):
   1. Scan for "Proveedor Logístico:" or "Logistics Provider:" or "Carrier:" labels
   2. Read the carrier name immediately AFTER the label
   3. Check near tracking numbers for carrier names
   4. Look for carrier logos or branding
   5. Check ALL shipping/delivery sections of the order
   6. If MULTIPLE items/packages → extract carriers for EACH ONE!

   🔴 CRITICAL RULES:
   - Extract carriers for EVERY shipment/package shown on the screenshot
   - If you see "Proveedor Logístico: USPS" → extract "USPS"
   - If you see "Proveedor Logístico: YunExpress" → extract "YunExpress"
   - If screenshot shows 3 packages with different carriers → return all 3!
   - Standardize names: "USPS" not "usps", "YunExpress" not "yunexpress"
   - Return as array: ["USPS", "YunExpress", "FedEx"] or ["UPS"]
   - If no carriers visible: null or empty array []

   🔴 EXAMPLES WITH SPANISH LABELS:
   ✅ "Proveedor Logístico: USPS" → extract "USPS"
   ✅ "Proveedor Logístico: YunExpress" → extract "YunExpress"
   ✅ Package 1: "Proveedor Logístico: USPS", Package 2: "Proveedor Logístico: YunExpress" → carriers: ["USPS", "YunExpress"]
   ✅ "Carrier: FedEx" → extract "FedEx"
   ✅ No carrier info visible → carriers: null or []

4. **ITEMS**
   For EACH item in the order:
   - Name: Item description/title
   - Quantity: Number of pieces (CRITICAL: if "Qty: 3" then quantity = 3)
   - Unit price: Price per single item (CRITICAL: Use sale price if item is on sale)
   - Total price: Quantity × Unit price
   - Weight: ONLY if visible on screenshot, otherwise null or 0 (DO NOT ESTIMATE)
   - Category: electronics, clothing, toys, home goods, etc.

   🔴 CRITICAL: ONLY extract prices that have a DOLLAR SIGN ($)
   - If you see a number without $, it's NOT a price (could be product ID, SKU, etc.)
   - ONLY numbers like "$5.00", "$12.99", "$0.99" are prices
   - Ignore numbers like "12345", "SKU-789", "Model 456" - these are NOT prices

   ⚠️ CRITICAL PRICE EXTRACTION RULES - READ CAREFULLY:

   RULE #1: ALWAYS USE THE LOWEST PRICE SHOWN
   - If you see a crossed-out/strikethrough price and a lower price, IGNORE the crossed-out price completely
   - The crossed-out price is the original price - DO NOT USE IT
   - The lower, non-crossed-out price is what the customer actually paid - USE THIS ONE

   RULE #2: NEVER USE ORIGINAL PRICES
   - Original price = crossed out/strikethrough = IGNORE
   - Sale price = lower price shown = USE THIS
   - Final price after discount = USE THIS

   EXAMPLES OF CORRECT PRICE EXTRACTION:
   ❌ WRONG: Original price $11.59 (crossed out), Sale price $4.58 → You extract $11.59
   ✅ CORRECT: Original price $11.59 (crossed out), Sale price $4.58 → You extract $4.58

   ❌ WRONG: Was $25.00, Now $19.99 → You extract $25.00
   ✅ CORRECT: Was $25.00, Now $19.99 → You extract $19.99

   ❌ WRONG: List $50, Your Price $35 → You extract $50
   ✅ CORRECT: List $50, Your Price $35 → You extract $35

   RULE #3: IF MULTIPLE PRICES ARE VISIBLE
   - Look for words like: "Sale", "Now", "Your Price", "Discounted", "Final Price"
   - Use the SMALLEST number shown
   - The customer ALWAYS pays the lowest price

   RULE #4: DOUBLE-CHECK YOUR WORK
   - After extracting all prices, verify you used the lowest price for each item
   - Recalculate: item.unitValue × item.quantity = item.totalValue
   - Sum all item.totalValue to get orderTotal

5. **TOTALS** ⚠️ CRITICAL - USE THE FINAL TOTAL FROM SCREENSHOT

   🔴 🔴 🔴 CRITICAL RULE #1: ONLY NUMBERS WITH DOLLAR SIGNS ($) ARE MONEY 🔴 🔴 🔴

   ⚠️ IGNORE ALL NUMBERS WITHOUT DOLLAR SIGNS:
   - Tracking numbers (e.g., "1234567890") = NOT MONEY, IGNORE
   - Order numbers (e.g., "Order #98765") = NOT MONEY, IGNORE
   - Quantities (e.g., "Qty: 3") = NOT MONEY, IGNORE
   - Dates (e.g., "12/14/2025") = NOT MONEY, IGNORE
   - Phone numbers, zip codes, product IDs = NOT MONEY, IGNORE
   - ONLY extract prices that have a $ symbol in front of them

   ❌ WRONG: Screenshot has "Order #123456" and you try to add 123456 to the total
   ✅ CORRECT: You completely ignore "123456" because it has no $ symbol

   ❌ WRONG: Screenshot has tracking "9876543210" and you add 9876543210 to total
   ✅ CORRECT: You ignore it completely - tracking numbers are NOT money

   🔴 🔴 🔴 MOST IMPORTANT RULE: USE THE ORANGE/PRODUCTS SUBTOTAL AS DEFAULT 🔴 🔴 🔴

   ⚠️ CRITICAL: When you see MULTIPLE dollar amounts on a screenshot:
   - PREFER the orange/colored number or "Productos" subtotal (sum of product prices)
   - Only fall back to the black "Total" if no orange/products number is visible
   - NEVER use crossed-out/strikethrough numbers
   - The orange/products subtotal is what the items are worth BEFORE coupons

   🔴 SHEIN SCREENSHOTS - SPECIAL ATTENTION:
   - Orange/colored number at top = Products subtotal (sum of items) → USE THIS AS DEFAULT
   - Black "Total" text at bottom = Final total after discounts → ONLY use if NO orange number exists
   - NEVER use crossed-out/strikethrough numbers
   - DEFAULT: Use the ORANGE/colored number (products subtotal)
   - FALLBACK: Use the black "Total" only if no orange/colored number is visible

   🔴 AMAZON SCREENSHOTS - SPECIAL ATTENTION:
   - "Productos: $XX" = Products subtotal → USE THIS AS DEFAULT
   - "Total (I.V.A. Incluido): $XX" = Final total after discounts → ONLY use if "Productos" is not visible
   - DEFAULT: Use "Productos" amount (sum of product prices)

   ORDER TOTAL EXTRACTION (CRITICAL):
   Step 1: Look for the PRODUCTS SUBTOTAL (orange/colored number or "Productos" label)
   - This is the SUM of all product prices BEFORE discounts/coupons
   - On Shein: this is the ORANGE/colored number near the top
   - On Amazon: this is labeled "Productos: $XX"
   - MUST have a $ symbol to be considered money
   - 🔴 USE THIS NUMBER AS DEFAULT — it represents what the items are worth

   Step 2: If you find a products subtotal, USE IT as orderTotal
   - Example: Orange text shows $45.99, black "Total" shows $40.99 → USE $45.99
   - Example: "Productos: $68.66", "Total (I.V.A. Incluido): $67.50" → USE $68.66

   Step 3: If NO products subtotal is visible, THEN use the final total
   - Look for "Total", "Order Total", "Grand Total" etc.
   - This is your fallback if no products subtotal is shown

   Step 4: If NO total of any kind is visible, calculate it:
   - Add up all item totalValue amounts (quantity × unitValue using sale price)
   - This is your last-resort fallback

   🔴 CRITICAL EXAMPLES:

   Example 1 - Products subtotal is visible (PREFERRED):
   - Item 1: $2.00
   - Item 2: $3.00
   - **Subtotal/Products: $5.00** ← USE THIS NUMBER (products subtotal)
   - Tax: $1.50
   - Shipping: $0.50
   - Total: $7.00
   - orderTotal = $5.00 (the products subtotal, NOT the final total with tax/shipping)

   Example 2 - Amazon order with discounts (CRITICAL EDGE CASE):
   - **Productos: US$68.66** (products subtotal) ← USE THIS NUMBER (default)
   - Envío: US$0.00 (shipping)
   - Sus cupones de ahorro: -US$1.29 (discount 1)
   - Sus cupones de ahorro: -US$3.70 (discount 2)
   - Total antes de impuestos: US$63.67 (after discounts, before tax)
   - Impuestos: US$3.83 (tax)
   - Total (I.V.A. Incluido): US$67.50 ← DO NOT USE (only use if "Productos" is not visible)
   - orderTotal = $68.66 (the Productos subtotal)

   🔴 🔴 🔴 Example 3 - Shein order with multiple totals (CRITICAL EDGE CASE):
   - **ORANGE TEXT at top: $45.99** (products subtotal) ← USE THIS NUMBER (default)
   - Shipping: $0.00
   - Discount: -$5.00
   - **BLACK TEXT "Total" at bottom: $40.99** ← DO NOT USE (only use if no orange number)
   - orderTotal = $45.99 (the ORANGE products subtotal)
   - 🔴 CRITICAL RULE: When you see MULTIPLE total amounts on a Shein screenshot:
     * USE the orange/colored number at the top (products subtotal) — this is DEFAULT
     * IGNORE the black "Total" text at the bottom (post-discount)
     * NEVER use crossed-out/strikethrough numbers
     * Only fall back to black total if NO orange number exists

   Example 4 - No final total visible (FALLBACK):
   - Item 1: 2 × $4.58 = $9.16
   - Item 2: 1 × $12.99 = $12.99
   - Item 3: 3 × $5.60 = $16.80
   - No "Total" shown on screenshot
   - orderTotal = $9.16 + $12.99 + $16.80 = $38.95

   ❌ WRONG APPROACH:
   - Screenshot shows orange $45.99 and black "Total" $40.99
   - You use $40.99 ← THIS IS WRONG
   - ✅ You should use $45.99 (the orange/products subtotal)

   ❌ WRONG APPROACH #2 (CRITICAL):
   - Screenshot shows "Productos: $68.66" and "Total (I.V.A. Incluido): $67.50"
   - You use $67.50 ← THIS IS WRONG
   - ✅ You should use $68.66 (the Productos subtotal — our default)

   CALCULATING TOTAL PIECES:
   - Simply add up all item quantities
   - Example: 2 shirts + 3 socks + 1 hat = 6 total pieces

   VERIFICATION:
   - Did you look for "Total", "Order Total", or "Grand Total" on the screenshot?
   - If you found one, did you use that number as orderTotal?
   - The final total will usually be larger than the sum of items (due to taxes/fees)

QUANTITY ACCURACY:
- If item shows "Quantity: 1" → quantity = 1
- If item shows "Qty: 5" → quantity = 5
- If item shows "2 items" → quantity = 2
- If same item appears multiple times, count each occurrence
- ALWAYS sum quantities for totalPieces

PLATFORM DETECTION:
- Scan for text, logos, URLs, or branding to identify the platform (any retailer worldwide)
- Extract the PLATFORM name, not vendor/seller/brand names
- Capitalize properly. If unrecognizable → null

KEY REMINDERS:
- Extract the PLATFORM name, not vendor/seller names from line items
- Spanish screenshots are normal for El Salvador
- If you cannot identify the platform → company = null
- Vendor names like "SHEIN LUNE CURVE", "Flirla CURVE" are NOT the platform - the platform is "Shein"

Return this EXACT JSON format:
{
  "customerName": "full name or null",
  "company": "Company Name or null",
  "seller": "same as company",
  "orderNumber": "order # or null",
  "orderDate": "date or null",
  "trackingNumber": "full tracking or null",
  "trackingNumberLast4": "last 4 digits or null",
  "carriers": ["USPS", "FedEx"] or [] or null,
  "items": [
    {
      "name": "full product name as shown on screenshot",
      "description": "item description",
      "customsDescription": "SHORT customs description in Spanish (3-5 words max): item type + color ONLY. NO brand names, NO marketing text, NO sizes. Examples: 'Calzoncillos Boxer Negro', 'Vestido Rojo Mujer', 'Consola Juegos Portátil', 'Camiseta Blanca Mujer', 'Zapatos Deportivos Negros'. If screenshot is in English, translate to Spanish.",
      "quantity": number,
      "unitValue": number,
      "totalValue": number,
      "weight": number,
      "category": "category name"
    }
  ],
  "orderTotal": number,
  "totalPieces": number
}

FINAL VALIDATION CHECKLIST - VERIFY BEFORE RESPONDING:
✓ 🔴 🔴 🔴 STEP 1: Is this an ACTUAL ORDER CONFIRMATION? (Not Google Shopping, not a random photo, not a product listing)
✓ 🔴 If NOT an order confirmation, did you return null/empty JSON?

✓ 🔴 🔴 🔴 STEP 2: PHONE NUMBER CHECK - Look at your trackingNumber field RIGHT NOW:
  - Count the digits. Is it exactly 10 digits? → DELETE IT IMMEDIATELY (it's a phone number!)
  - Count the digits. Is it exactly 11 digits starting with "1"? → DELETE IT IMMEDIATELY (it's a phone number!)
  - Does it have format (XXX) XXX-XXXX or XXX-XXX-XXXX? → DELETE IT IMMEDIATELY (it's a phone number!)
  - Does it start with 1-800, 1-888, 1-877, 1-866? → DELETE IT IMMEDIATELY (toll-free phone!)
  - If you deleted it, set trackingNumber to null
  - Example: "5551234567" = 10 digits = PHONE = DELETE = trackingNumber: null ✅
  - Example: "18005551234" = 11 digits starting with 1 = PHONE = DELETE = trackingNumber: null ✅

✓ 🔴 🔴 🔴 STEP 3: CARRIER CHECK - Look at your carriers array:
  - Did you scan for "Proveedor Logístico:" labels? (Spanish screenshots!)
  - Did you check EVERY package/shipment on the screenshot?
  - If screenshot has multiple packages, did you extract carriers for ALL of them?
  - Did you include carriers like YunExpress, 4PX, China Post if visible?
  - Examples:
    * "Proveedor Logístico: USPS" → carriers: ["USPS"] ✅
    * "Proveedor Logístico: YunExpress" → carriers: ["YunExpress"] ✅
    * Package 1 = USPS, Package 2 = YunExpress → carriers: ["USPS", "YunExpress"] ✅
✓ 🔴 🔴 🔴 Did you ONLY extract prices with DOLLAR SIGNS ($)?
✓ 🔴 Did you ignore ALL numbers without $ (tracking, order numbers, dates, quantities, etc.)?
✓ Did you use SALE prices (lowest price shown) for all items?
✓ Did you IGNORE all crossed-out/original prices?
✓ Each item.totalValue = item.quantity × item.unitValue (using sale price)
✓ 🔴 MOST IMPORTANT: Did you look for the ORANGE/colored number or "Productos" subtotal?
✓ 🔴 If an orange/products subtotal is shown, did you use THAT number as orderTotal?
✓ 🔴 Only fall back to black "Total" if no orange/products number exists
✓ If NO total of any kind is shown, orderTotal = sum of all item.totalValue values
✓ totalPieces = sum of all item.quantity values
✓ Company name is properly capitalized
✓ Tracking last 4 matches the actual last 4 of tracking number

⚠️ BEFORE YOU RESPOND - FINAL VALIDATION:

1. 🔴 🔴 🔴 FIRST: Is this a Google Shopping search, product listing, or random photo? If YES, return null/empty JSON immediately!

1.5. 🔴 🔴 🔴 LOWEST TOTAL CHECK - CRITICAL VALIDATION:
   STOP! Before you finalize orderTotal, answer these questions:

   ✓ Step A: List ALL dollar amounts you see on the screenshot with $ symbols
     - Write them ALL down: $XX.XX, $YY.YY, $ZZ.ZZ, etc.

   ✓ Step B: Which ones are crossed out / strikethrough?
     - Crossed-out prices = IGNORE (original prices before discount)
     - Active prices = USE (current prices after discount)

   ✓ Step C: Which ones are labeled as "Total", "Order Total", "Grand Total", "Final Total"?
     - Write down ALL amounts with "Total" labels
     - Example: "Orange $45.99" vs "Black Total $40.99"

   ✓ Step D: Which "Total" amount is at the BOTTOM of the screenshot?
     - The bottom "Total" is usually the FINAL amount after all discounts
     - This is what customer ACTUALLY PAID

   ✓ Step E: Is there an orange/colored number or "Productos" subtotal?
     - If YES → USE IT as orderTotal (this is the products subtotal, our default)
     - If you see $45.99 (orange) and $40.99 (black "Total" at bottom) → USE $45.99 (orange)
     - If you see $68.66 ("Productos") and $67.50 ("Total I.V.A.") → USE $68.66 (Productos)

   ✓ Step F: If NO orange/products subtotal exists, use the final "Total" amount
     - Only fall back to the black/bottom total if no orange/products number is visible
     - NEVER use crossed-out/strikethrough numbers

   🔴 CRITICAL: Your orderTotal should be the ORANGE/products subtotal if visible. Only fall back to black total if no orange number exists!

2. 🔴 🔴 🔴 PHONE NUMBER CHECK - VERIFY YOUR TRACKING NUMBER RIGHT NOW:
   - Look at trackingNumber field you're about to return
   - Count the digits carefully: How many digits total?
   - If exactly 10 digits → IT'S A PHONE NUMBER → SET TO NULL!
   - If exactly 11 digits AND starts with "1" → IT'S A PHONE NUMBER → SET TO NULL!
   - If has dashes/parentheses in XXX-XXX-XXXX format → IT'S A PHONE NUMBER → SET TO NULL!
   - Examples of PHONE NUMBERS to DELETE:
     * "5551234567" (10 digits) → trackingNumber: null
     * "18005551234" (11 digits, starts with 1) → trackingNumber: null
     * "(555) 123-4567" (phone format) → trackingNumber: null
   - Only keep it if it's 12+ digits, OR starts with "1Z", OR is 20-22 digits

3. 🔴 🔴 🔴 CARRIER CHECK - VERIFY YOUR CARRIERS ARRAY RIGHT NOW:
   - Look at carriers array you're about to return
   - Did you scan for "Proveedor Logístico:" labels? (These screenshots are often in Spanish!)
   - Did you scan the ENTIRE screenshot for ALL carrier names?
   - If there are multiple packages/shipments, did you get carriers for ALL of them?
   - Did you check for carriers like: USPS, UPS, FedEx, YunExpress, 4PX, China Post, etc.?
   - Examples of what you should find:
     * If you see "Proveedor Logístico: USPS" → carriers must include "USPS"
     * If you see "Proveedor Logístico: YunExpress" → carriers must include "YunExpress"
     * If Package 1 has "Proveedor Logístico: USPS" AND Package 2 has "Proveedor Logístico: YunExpress" → carriers: ["USPS", "YunExpress"]

4. 🔴 PRICE CHECK: Did you accidentally add any numbers WITHOUT dollar signs to prices?
5. Review each item - did you use the LOWEST price shown WITH A $ SYMBOL?
6. 🔴 🔴 🔴 TOTAL CHECK - ALREADY VALIDATED IN STEP 1.5 ABOVE:
   - You already checked for orange/products subtotal and used it if visible
   - You only used the black "Total" if no orange/products number was found
   - If you skipped step 1.5, GO BACK and do it now!

7. 🔴 DOUBLE-CHECK: Is your orderTotal the ORANGE/products subtotal (if visible)?
   - List all "Total" amounts again: ________
   - Your orderTotal: ________
   - Is it the orange/products subtotal? If orange exists and you used black, fix it immediately!

8. 🔴 FINAL CHECK: Does your orderTotal look reasonable? (If it's in millions/billions, you added a tracking number by mistake)

Return ONLY valid JSON, no markdown, no extra text.`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Image
      }
    }
  ]);

  // RECITATION handling - extract from candidate to avoid .text() throwing errors
  const candidate = result.response.candidates?.[0];
  let responseText = '';

  // Check for RECITATION flag FIRST
  const isRecitationBlocked = candidate?.finishReason === 'RECITATION';

  if (isRecitationBlocked) {
    // RECITATION detected - try to extract from candidate (don't call .text())
    console.warn('⚠️ RECITATION detected - attempting direct extraction for customs declaration purposes');

    const partialText = candidate?.content?.parts?.[0]?.text;
    if (partialText && partialText.trim().length > 0) {
      responseText = partialText;
      console.log('✓ Successfully extracted partial response despite RECITATION block');
    } else {
      // No content available - try OCR fallback
      console.warn('⚠️ RECITATION completely blocked response - trying OCR fallback...');

      try {
        // Extract text using OCR
        const ocrText = await extractWithOCR(base64Image);

        // Now send the OCR text to Gemini for structuring (same prompt, just text instead of image)
        console.log('📝 Sending OCR text to Gemini for structuring...');

        const textModel = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
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
        console.log('✓ Successfully structured data from OCR text');
      } catch (ocrError) {
        console.error('OCR fallback failed:', ocrError);
        // Last resort - return empty data for manual entry
        return {
          customerName: undefined,
          company: undefined,
          seller: undefined,
          orderNumber: undefined,
          orderDate: undefined,
          trackingNumber: undefined,
          trackingNumberLast4: undefined,
          carriers: undefined,
          items: [],
          orderTotal: 0,
          totalPieces: 0
        };
      }
    }
  } else {
    // No RECITATION - normal extraction
    responseText = result.response.text();
  }

  // Extract JSON from response
  let jsonText = responseText;
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1].split('```')[0].trim();
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonText);

  // 🔴 DEBUG: Log what Gemini extracted BEFORE any post-processing
  console.log('🔍 RAW GEMINI EXTRACTION:', JSON.stringify({
    customerName: parsed.customerName,
    orderTotal: parsed.orderTotal,
    items: parsed.items?.map((i: any) => ({ name: i.name, quantity: i.quantity, unitValue: i.unitValue, totalValue: i.totalValue }))
  }, null, 2));

  // 🔴 CRITICAL: Automatic phone number detection and removal (fail-safe)
  if (parsed.trackingNumber) {
    const trackingNum = String(parsed.trackingNumber).replace(/\D/g, ''); // Remove non-digits

    // Check if it's a phone number
    const isPhoneNumber =
      trackingNum.length === 10 || // 10-digit phone
      (trackingNum.length === 11 && trackingNum.startsWith('1')) || // 1-800, etc.
      trackingNum.startsWith('800') || // toll-free
      trackingNum.startsWith('888') ||
      trackingNum.startsWith('877') ||
      trackingNum.startsWith('866');

    if (isPhoneNumber) {
      console.warn(`⚠️ PHONE NUMBER DETECTED AND REMOVED: "${parsed.trackingNumber}" (${trackingNum.length} digits)`);
      parsed.trackingNumber = null;
      parsed.trackingNumberLast4 = null;
    }
  }

  // Post-processing validation and cleanup
  // Recalculate totals to verify AI calculations
  let calculatedItemsTotal = 0; // Sum of just the items (no taxes/fees)
  let calculatedTotalPieces = 0;

  if (parsed.items && Array.isArray(parsed.items)) {
    parsed.items.forEach((item: any) => {
      // Verify item totalValue = quantity × unitValue
      const expectedItemTotal = (item.quantity || 0) * (item.unitValue || 0);
      if (item.totalValue && Math.abs(item.totalValue - expectedItemTotal) > 0.01) {
        console.warn(`⚠️ Item calculation mismatch: "${item.name}" - AI said $${item.totalValue}, should be ${item.quantity} × $${item.unitValue} = $${expectedItemTotal.toFixed(2)}`);
        item.totalValue = expectedItemTotal; // Auto-correct
      }

      calculatedItemsTotal += item.totalValue || 0;
      calculatedTotalPieces += item.quantity || 0;
    });
  }

  // Smart validation for orderTotal
  // The AI should extract the final total from the screenshot
  // IMPORTANT: The final total can be HIGHER (taxes/fees) OR LOWER (discounts) than items total
  if (parsed.orderTotal && Math.abs(parsed.orderTotal - calculatedItemsTotal) > 0.01) {
    // Check if AI's total is LARGER than items total (suggests taxes/fees included)
    if (parsed.orderTotal > calculatedItemsTotal) {
      const difference = parsed.orderTotal - calculatedItemsTotal;
      console.log(`✓ Final total ($${parsed.orderTotal.toFixed(2)}) includes $${difference.toFixed(2)} in taxes/fees/shipping on top of items total ($${calculatedItemsTotal.toFixed(2)})`);
      // Trust the AI - they found the final total on the screenshot
    } else {
      // AI's total is LOWER than items total - this is OK! Discounts exist!
      const difference = calculatedItemsTotal - parsed.orderTotal;
      console.log(`✓ Final total ($${parsed.orderTotal.toFixed(2)}) is $${difference.toFixed(2)} less than items subtotal ($${calculatedItemsTotal.toFixed(2)}) - discounts/coupons applied`);
      // Trust the AI - they found the final total after discounts on the screenshot
    }
  } else if (!parsed.orderTotal) {
    // No total provided, use calculated
    parsed.orderTotal = calculatedItemsTotal;
  }

  // Verify totalPieces matches sum of quantities
  if (parsed.totalPieces && parsed.totalPieces !== calculatedTotalPieces) {
    console.warn(`⚠️ Total pieces mismatch: AI said ${parsed.totalPieces}, calculated ${calculatedTotalPieces}`);
    parsed.totalPieces = calculatedTotalPieces;
  }

  const extractedData: ExtractedOrderData = {
    customerName: parsed.customerName || undefined,
    company: parsed.company || parsed.seller || undefined,
    seller: parsed.company || parsed.seller || undefined,
    orderNumber: parsed.orderNumber || undefined,
    orderDate: parsed.orderDate || undefined,
    trackingNumber: parsed.trackingNumber || undefined,
    trackingNumberLast4: parsed.trackingNumberLast4 || (parsed.trackingNumber ? parsed.trackingNumber.slice(-4) : undefined),
    carriers: parsed.carriers && Array.isArray(parsed.carriers) && parsed.carriers.length > 0 ? parsed.carriers : undefined,
    items: parsed.items || [],
    orderTotal: parsed.orderTotal || calculatedItemsTotal || 0, // Use AI's total (includes taxes/fees) or fallback to calculated
    totalPieces: parsed.totalPieces || calculatedTotalPieces || 0
  };

  // Log final verification
  console.log(`✓ Extraction complete: ${extractedData.items.length} items, $${extractedData.orderTotal.toFixed(2)} total, ${extractedData.totalPieces} pieces`);

  // 🔴 DEBUG: Log final extracted data AFTER post-processing
  console.log('🔍 FINAL EXTRACTION DATA:', JSON.stringify({
    customerName: extractedData.customerName,
    orderTotal: extractedData.orderTotal,
    company: extractedData.company,
    trackingNumber: extractedData.trackingNumber,
    itemsCount: extractedData.items.length
  }, null, 2));

  return extractedData;
};

/**
 * Extract orders from a Machote-style Word doc that contains embedded screenshots.
 * Parses the HTML to split customer blocks, extracts metadata (name, package#, carrier, value),
 * then runs analyzeOrderScreenshot on each embedded image.
 */
export interface MachoteCustomer {
  name: string;
  packageNumber: string;
  carrier: string;
  trackingLast4: string;
  value: number;
  items: PackageItem[];
  screenshotBase64s: string[]; // base64 data URIs of embedded images
  totalPieces: number;
  orderTotal: number;
}

export const extractOrdersFromMachoteDoc = async (
  docHtml: string,
  onProgress?: (current: number, total: number) => void
): Promise<MachoteCustomer[]> => {
  // Split HTML into customer blocks by looking for name/Paquete patterns
  // The Machote doc has patterns like: "NOMBRE DEL CLIENTE" or customer names before "Paquete #N"
  // We'll split on strong/bold text that precedes package info

  // Extract all image data URIs from the HTML
  const allImages: { index: number; src: string }[] = [];
  const imgRegex = /<img[^>]+src="(data:image\/[^"]+)"[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(docHtml)) !== null) {
    allImages.push({ index: imgMatch.index, src: imgMatch[1] });
  }
  console.log(`📄 Machote doc: found ${allImages.length} embedded images`);

  // Look for customer block patterns - split on "Paquete #N" occurrences
  // Pattern: Customer Name ... Paquete #N ... carrier + tracking ... VALOR $XX.XX
  const blockRegex = /(?:Paquete\s*#?\s*(\d+))/gi;
  const blockPositions: { index: number; packageNum: string }[] = [];
  let blockMatch;
  while ((blockMatch = blockRegex.exec(docHtml)) !== null) {
    blockPositions.push({ index: blockMatch.index, packageNum: blockMatch[1] });
  }
  console.log(`📄 Found ${blockPositions.length} package blocks`);

  if (blockPositions.length === 0) {
    throw new Error('No "Paquete #" patterns found in document. This may not be a Machote-format document.');
  }

  // For each block, extract the surrounding text to find metadata
  const customers: MachoteCustomer[] = [];

  for (let i = 0; i < blockPositions.length; i++) {
    const blockStart = blockPositions[i].index;
    const blockEnd = i + 1 < blockPositions.length ? blockPositions[i + 1].index : docHtml.length;
    const blockHtml = docHtml.substring(
      // Look back up to 500 chars before "Paquete" to capture the customer name
      Math.max(0, blockStart - 500),
      blockEnd
    );

    // Strip HTML tags for text-based regex matching
    const blockText = blockHtml.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ');

    // Extract customer name - typically bold text before "Paquete"
    // Look for the name in the text before "Paquete"
    const paqueteIdx = blockText.indexOf('Paquete');
    const textBeforePaquete = paqueteIdx > 0 ? blockText.substring(0, paqueteIdx).trim() : '';

    // The customer name is usually the last significant text before Paquete
    // Try to extract from bold tags in original HTML
    let customerName = 'Unknown';
    const nameBeforePaquete = blockHtml.substring(0, blockHtml.indexOf('Paquete'));
    const boldNames = nameBeforePaquete.match(/<strong>([^<]+)<\/strong>/gi);
    if (boldNames && boldNames.length > 0) {
      // Get the last bold text before Paquete
      const lastBold = boldNames[boldNames.length - 1].replace(/<\/?strong>/gi, '').trim();
      if (lastBold.length > 1 && lastBold.length < 60) {
        customerName = lastBold;
      }
    }
    // Fallback: look for capitalized name patterns in text before Paquete
    if (customerName === 'Unknown' && textBeforePaquete) {
      // Look for words that look like names (capitalized, 2+ words)
      const nameMatch = textBeforePaquete.match(/([A-Z][a-zA-záéíóúñÁÉÍÓÚÑ]+(?:\s+[A-Z][a-zA-záéíóúñÁÉÍÓÚÑ]+)+)\s*$/);
      if (nameMatch) {
        customerName = nameMatch[1].trim();
      }
    }

    const packageNumber = blockPositions[i].packageNum;

    // Extract carrier + tracking last 4 - format is "USPS #9728" or "FedEx #2824" or "SpeedX #9359"
    const carrierTrackingMatch = blockText.match(/\b(USPS|UPS|FedEx|DHL|Amazon\s*Logistics?|OnTrac|LaserShip|SpeedX)\s*#?\s*(\d{4})\b/i);
    const carrier = carrierTrackingMatch ? carrierTrackingMatch[1] : '';
    const trackingLast4 = carrierTrackingMatch ? carrierTrackingMatch[2] : '';

    // Extract VALOR (value) - also handles "VAR:" typo
    const valorMatch = blockText.match(/VALO?R\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ||
      blockText.match(/\$\s*([\d,]+\.?\d*)/);
    const value = valorMatch ? parseFloat(valorMatch[1].replace(',', '')) : 0;

    // Find images that belong to this block (between this block start and next block start)
    const blockImages = allImages.filter(img =>
      img.index >= (blockStart - 500) && img.index < blockEnd
    );

    customers.push({
      name: customerName,
      packageNumber: `Paquete #${packageNumber}`,
      carrier,
      trackingLast4,
      value,
      items: [],
      screenshotBase64s: blockImages.map(img => img.src),
      totalPieces: 0,
      orderTotal: value,
    });
  }

  // Now process all screenshots through Gemini vision with concurrency limit
  const CONCURRENCY = 4;
  let totalScreenshots = customers.reduce((sum, c) => sum + c.screenshotBase64s.length, 0);
  let processedCount = 0;

  console.log(`📸 Processing ${totalScreenshots} screenshots across ${customers.length} customers...`);

  for (const customer of customers) {
    if (customer.screenshotBase64s.length === 0) continue;

    const allItems: PackageItem[] = [];

    // Process images in batches of CONCURRENCY
    for (let j = 0; j < customer.screenshotBase64s.length; j += CONCURRENCY) {
      const batch = customer.screenshotBase64s.slice(j, j + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (imgSrc) => {
          // Extract mime type and base64 data from data URI
          const dataMatch = imgSrc.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (!dataMatch) return null;
          const imgMimeType = dataMatch[1];
          const base64Data = dataMatch[2];
          return analyzeOrderScreenshot(base64Data, imgMimeType);
        })
      );

      for (const result of results) {
        processedCount++;
        if (onProgress) onProgress(processedCount, totalScreenshots);

        if (result.status === 'fulfilled' && result.value) {
          const extracted = result.value;
          if (extracted.items && extracted.items.length > 0) {
            allItems.push(...extracted.items);
          }
          // Pick up carrier from screenshot if not found in text
          if (!customer.carrier && extracted.carriers && extracted.carriers.length > 0) {
            customer.carrier = extracted.carriers[0];
          }
        } else if (result.status === 'rejected') {
          console.warn(`⚠️ Screenshot extraction failed for ${customer.name}:`, result.reason);
        }
      }
    }

    customer.items = allItems;
    customer.totalPieces = allItems.reduce((s, item) => s + (item.quantity || 0), 0);
    // Use extracted item total if we have items, otherwise keep the VALOR from the doc
    if (allItems.length > 0) {
      const itemsTotal = allItems.reduce((s, item) => s + (item.totalValue || 0), 0);
      // Use the higher of document VALOR or items total (VALOR is authoritative)
      customer.orderTotal = customer.value > 0 ? customer.value : itemsTotal;
    }
  }

  console.log(`✅ Machote extraction complete: ${customers.length} customers, ${processedCount} screenshots processed`);
  return customers;
};

/**
 * Extract order items from Word document text.
 * Used when a customer sends a Word doc listing their items.
 */
export const extractItemsFromDocText = async (docText: string, customerName?: string): Promise<{
  customers: Array<{
    name: string;
    items: PackageItem[];
    orderTotal: number;
    totalPieces: number;
  }>;
}> => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      topP: 1.0,
      candidateCount: 1,
      responseMimeType: 'application/json',
    },
  });

  const prompt = `You are extracting item data from a Word document for El Salvador customs declarations.
The output must match EXACTLY the same format as screenshot-based order extraction.

The document contains a list of items that a customer is importing. Extract ALL items with their details.

RULES:
- Extract EVERY item mentioned in the document
- For each item you MUST provide ALL of these fields:
  * name: full item name as written in the document
  * description: brief description of the item (what it is, material, notable features)
  * customsDescription: SHORT Spanish customs description (3-5 words max): item type + color ONLY. NO brand names, NO marketing text, NO sizes. Examples: 'Calzoncillos Boxer Negro', 'Vestido Rojo Mujer', 'Consola Juegos Portátil'. If item is in English, translate to Spanish.
  * quantity: number of pieces (default 1 if not specified)
  * unitValue: price per single unit in USD
  * totalValue: quantity × unitValue
  * category: one of: electronics, clothing, toys, food, accessories, cosmetics, footwear, home goods, other
- If the document lists multiple customers/consignees, group items by customer
- If no customer name is found in the document, use "${customerName || 'Unknown'}" as the customer name
- Prices should be in USD. If no currency specified, assume USD.
- orderTotal = sum of all item totalValues
- totalPieces = sum of all item quantities

Return this EXACT JSON format:
{
  "customers": [
    {
      "name": "Customer Name",
      "items": [
        {
          "name": "full item name from document",
          "description": "brief description of item",
          "customsDescription": "Short Spanish customs description (e.g., 'Calzoncillos Boxer Negro')",
          "quantity": 1,
          "unitValue": 10.00,
          "totalValue": 10.00,
          "category": "clothing"
        }
      ],
      "orderTotal": 100.00,
      "totalPieces": 10
    }
  ]
}

Return ONLY valid JSON.

DOCUMENT TEXT:
${docText}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  let jsonText = responseText;
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1].split('```')[0].trim();
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonText);

  // Ensure structure
  if (!parsed.customers || !Array.isArray(parsed.customers)) {
    return { customers: [{ name: customerName || 'Unknown', items: [], orderTotal: 0, totalPieces: 0 }] };
  }

  for (const customer of parsed.customers) {
    if (!customer.items) customer.items = [];
    customer.items = customer.items.map((item: any) => ({
      name: item.name || 'Unknown Item',
      customsDescription: item.customsDescription || null,
      description: item.description || null,
      quantity: item.quantity || 1,
      unitValue: item.unitValue || 0,
      totalValue: item.totalValue || (item.unitValue || 0) * (item.quantity || 1),
      category: item.category || 'other',
    }));
    customer.totalPieces = customer.items.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
    customer.orderTotal = customer.items.reduce((s: number, i: any) => s + (i.totalValue || 0), 0);
  }

  return parsed;
};

/**
 * Legacy package photo analyzer - kept for backward compatibility
 * Recommend using analyzeOrderScreenshot instead
 */
export const analyzePackagePhoto = async (base64Image: string): Promise<{
  trackingNumber?: string;
  carrier?: string;
  items: PackageItem[];
  origin?: string;
}> => {
  // Use the enhanced analyzer and map to legacy format
  const enhanced = await analyzeOrderScreenshot(base64Image);

  return {
    trackingNumber: enhanced.trackingNumber,
    carrier: enhanced.company,
    items: enhanced.items,
    origin: undefined
  };
};

/**
 * Invoice photo analyzer
 */
export const analyzeInvoicePhoto = async (base64Image: string): Promise<{
  customerName?: string;
  invoiceNumber?: string;
  items: PackageItem[];
  totalValue: number;
  totalPieces: number;
  currency: string;
  trackingNumber?: string;
  trackingNumberLast4?: string;
  company?: string;
  orderDate?: string;
}> => {
  // Use the enhanced analyzer
  const enhanced = await analyzeOrderScreenshot(base64Image);

  return {
    customerName: enhanced.customerName,
    company: enhanced.company,
    orderDate: enhanced.orderDate,
    trackingNumber: enhanced.trackingNumber,
    trackingNumberLast4: enhanced.trackingNumberLast4,
    invoiceNumber: enhanced.orderNumber,
    currency: 'USD',
    items: enhanced.items,
    totalValue: enhanced.orderTotal || 0,
    totalPieces: enhanced.totalPieces || 0
  };
};
