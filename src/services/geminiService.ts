import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PackageItem, ExtractedOrderData } from '../types';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

/**
 * Enhanced MVP Order Screenshot Analyzer
 * Optimized for 95%+ accuracy on e-commerce order screenshots
 * This is the primary function to use for analyzing order screenshots
 */
export const analyzeOrderScreenshot = async (base64Image: string): Promise<ExtractedOrderData> => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `You are an AI assistant specialized in extracting data from e-commerce order screenshots with 95%+ accuracy.
This is for an import business in El Salvador processing customer orders.

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

🔴 🔴 🔴 STEP 1: VERIFY THIS IS AN ACTUAL ORDER CONFIRMATION 🔴 🔴 🔴

BEFORE extracting ANY data, verify this screenshot is an ACTUAL ORDER CONFIRMATION.

✅ VALID ORDER CONFIRMATIONS have these indicators:
- "Order Confirmation", "Order Receipt", "Order Details", "Your Order" header
- Shows a TOTAL amount paid (labeled "Total:", "Order Total:", "Grand Total:", etc.)
- Has a shipping/delivery address with customer name
- Shows order number or tracking number
- From a known retailer (Amazon, Shein, Walmart, eBay, AliExpress, Temu, etc.)
- Shows purchased items with individual prices

❌ REJECT these screenshots (return null/empty data):
- Google Shopping search results (shows "Google Shopping" at top, has "Search" bar)
- Product listing pages (shows multiple products to buy, no order placed yet)
- Shopping cart pages (shows cart, no order confirmed yet)
- Random photos (garage doors, street signs, sidewalks, vehicles, buildings, etc.)
- Websites or apps that are NOT order confirmations
- Spreadsheets, calendars, schedules
- Screenshots of the ImportFlow app itself

🔴 IF THE SCREENSHOT IS NOT AN ORDER CONFIRMATION:
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
}

🔴 EXAMPLES OF WHAT TO REJECT:

Example 1 - Google Shopping (REJECT):
- Shows "Google Shopping" at top
- Has search bar with product name
- Shows multiple products with "Buy" buttons
- NO order confirmation, NO shipping address
→ Return null/empty JSON

Example 2 - Random photo (REJECT):
- Photo of a garage door, street sign, vehicle, building, etc.
- No prices, no order information
→ Return null/empty JSON

Example 3 - Product listing (REJECT):
- Shows a single product page from Amazon/eBay
- Has "Add to Cart" or "Buy Now" button
- NO order confirmation header
→ Return null/empty JSON

✅ ONLY PROCEED TO EXTRACT DATA IF THIS IS A CONFIRMED ORDER SCREENSHOT ✅

WHAT TO EXTRACT:

1. **CUSTOMER NAME** (English or Spanish)
   - English labels: "Ship to", "Recipient", "Deliver to", "Customer", "Name"
   - Spanish labels: "Enviar a", "Destinatario", "Entregar a", "Cliente", "Nombre"
   - Look in shipping address section for customer name
   - Return full name exactly as shown
   - If not visible: null

2. **COMPANY/SELLER** 🔴 CRITICAL: ONLY extract Amazon, Shein, or Temu!

   🔴 🔴 🔴 VALID COMPANIES: Only these 3 platforms are used:
   - **Amazon** - Amazon.com orders
   - **Shein** - Shein.com orders
   - **Temu** - Temu.com orders

   🔴 IGNORE all other platforms - If screenshot is NOT from Amazon/Shein/Temu → company = null

   ⚠️ THE PROBLEM:
   - These marketplaces show vendor/supplier names on product line items
   - Example: Shein order screenshot shows "Ray's Playhouse" as the vendor for a product
   - You MUST extract "Shein" (the platform), NOT "Ray's Playhouse" (the vendor on the line item)

   🔴 STEP-BY-STEP PROCESS TO IDENTIFY THE PLATFORM:

   STEP 1: Look at the OVERALL DESIGN of the screenshot
   - What does the header/top of the page look like?
   - What colors dominate the design?
   - What is the layout style and UI design?
   - Is there a logo at the top?

   STEP 2: Check for SPECIFIC TEXT FIRST (highest priority - in English or Spanish):

   🔴 FIRST, scan the ENTIRE screenshot for these specific text strings:
   - If you see "SHEIN", "Shein", "shein.com", "us.shein.com" ANYWHERE → company = "Shein"
   - If you see "Amazon", "amazon.com", "Amazon.com" ANYWHERE → company = "Amazon"
   - If you see "Temu", "temu.com" ANYWHERE → company = "Temu"
   - If you see ANY OTHER company name → company = null (only Amazon/Shein/Temu accepted)

   STEP 3: If no clear text branding found, match by VISUAL DESIGN (only these 3):

   **SHEIN** - Black/white modern design:
   - TEXT MARKERS:
     * "SHEIN" text or logo ANYWHERE on screenshot
     * "shein.com" or "us.shein.com" in URL
   - VISUAL MARKERS:
     * Predominantly BLACK header/top bar
     * Black and white color scheme
     * Very clean, modern, minimalist UI
     * Product images in a grid with white background
     * Modern fashion aesthetic
   - UNIQUE TO SHEIN:
     * Shows vendor/store names like "Ray's Playhouse", "SHEIN LUNE CURVE" on line items ← IGNORE vendor names!
     * Modern app-style interface
   - Spanish screenshots may show "SHEIN" branding

   **AMAZON** - Blue/orange design:
   - TEXT MARKERS:
     * "Amazon" text or smile logo
     * "amazon.com" in URL
   - VISUAL MARKERS:
     * Orange/yellow "Amazon" logo with smile arrow
     * Dark blue navigation bar at top
     * "Ships from" and "Sold by" labels showing third-party sellers ← IGNORE seller names!
     * Distinctive Amazon order confirmation layout
     * Orange "Add to Cart" or "Buy Now" buttons
     * Very structured, grid-like product display

   **TEMU** - Orange/white vibrant design:
   - TEXT MARKERS:
     * "Temu" branding anywhere
     * "temu.com" in URL
   - VISUAL MARKERS:
     * Bright ORANGE and white branding
     * "Shop Like a Billionaire" or similar slogans
     * Very aggressive pricing display
     * Countdown timers and flash sale banners
     * Modern, app-style interface with orange theme

   STEP 4: Make your final decision and validate:

   🔴 DECISION TREE (ONLY these 3 companies accepted):
   1. Did you find "SHEIN" text anywhere? → company = "Shein" ✅
   2. Did you find "Amazon" text anywhere? → company = "Amazon" ✅
   3. Did you find "Temu" text anywhere? → company = "Temu" ✅
   4. No text found? Look at design:
      - BLACK header + clean design + fashion items = "Shein" ✅
      - BLUE header + smile logo area = "Amazon" ✅
      - ORANGE + "Shop Like..." = "Temu" ✅
   5. Not from Amazon/Shein/Temu? → company = null ✅

   🔴 BEFORE YOU FINALIZE - ASK YOURSELF:
   - Did I look for text branding FIRST before relying on colors?
   - Is this from Amazon, Shein, or Temu? (ONLY these 3 accepted)
   - If I see vendor names like "Ray's Playhouse" or "SHEIN LUNE CURVE", am I extracting the PLATFORM (Shein) not the vendor?
   - Screenshot in Spanish? That's normal for El Salvador - extract data anyway!

   ✅ CORRECT EXAMPLES:
   - Shein screenshot (Spanish), product from "SHEIN LUNE CURVE" → company = "Shein" ✅
   - Shein screenshot, product from "Ray's Playhouse" → company = "Shein" ✅
   - Amazon screenshot, sold by "BestDeals123" → company = "Amazon" ✅
   - Temu screenshot, aggressive pricing → company = "Temu" ✅

   ❌ WRONG EXAMPLES (DO NOT DO THIS):
   - Shein screenshot, product from "Ray's Playhouse" → company = "Ray's Playhouse" ❌ WRONG!
   - Amazon screenshot, sold by "BestDeals123" → company = "BestDeals123" ❌ WRONG!
   - eBay screenshot → company = "eBay" ❌ WRONG! (not in accepted list)

   🔴 CRITICAL RULES:
   - Look at the ENTIRE screenshot's design, not just product line items
   - Vendor/supplier names appear IN THE MIDDLE of the page (on product listings) - IGNORE THEM
   - Platform branding appears at the TOP (header, logo, URL) - USE THIS
   - If you see a vendor name like "Ray's Playhouse", ask yourself: "What platform is this screenshot from?"
   - Even if the logo isn't visible, identify the platform by layout, colors, and design patterns
   - The platform is WHERE the customer placed the order, not who manufactured/supplied the item

   VALID PLATFORMS (use exactly these names):
   - "Shein" - for Shein.com orders (ignore line item vendors like "Ray's Playhouse")
   - "Amazon" - for Amazon.com orders (ignore "Sold by" sellers)
   - "AliExpress" - for AliExpress orders (ignore store names)
   - "Temu" - for Temu.com orders
   - "eBay" - for eBay.com orders (ignore seller usernames)
   - "Walmart" - for Walmart.com orders (ignore third-party sellers)
   - "Target" - for Target.com orders
   - Other direct retailers: "Nike.com", "BestBuy", "HomeDepot", etc.

   - Standardize: Capitalize properly (e.g., "Shein" not "SHEIN" or "shein")
   - If platform cannot be identified from design: null

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

   🔴 MOST IMPORTANT RULE: ALWAYS USE THE FINAL TOTAL SHOWN ON THE SCREENSHOT

   ORDER TOTAL EXTRACTION (CRITICAL):
   Step 1: Look for the FINAL/GRAND TOTAL on the screenshot
   - Search for labels like: "Total", "Order Total", "Grand Total", "Amount Due", "Total Price"
   - MUST have a $ symbol to be considered money
   - This total includes taxes, fees, shipping, and discounts
   - ⚠️ This is the ACTUAL amount the customer paid

   Step 2: If you find a final total, USE IT as orderTotal
   - Example: If items are $5 each but bottom shows "Total: $7.00", use $7.00
   - The extra $2 is taxes/fees - we want the FULL amount including everything

   Step 3: If NO final total is visible, then calculate it:
   - Add up all item totalValue amounts (quantity × unitValue using sale price)
   - This is your fallback if no total is shown

   🔴 CRITICAL EXAMPLES:

   Example 1 - Final total is visible (PREFERRED):
   - Item 1: $2.00
   - Item 2: $3.00
   - Subtotal: $5.00
   - Tax: $1.50
   - Shipping: $0.50
   - **TOTAL: $7.00** ← USE THIS NUMBER
   - orderTotal = $7.00 (NOT $5.00)

   Example 2 - No final total visible (FALLBACK):
   - Item 1: 2 × $4.58 = $9.16
   - Item 2: 1 × $12.99 = $12.99
   - Item 3: 3 × $5.60 = $16.80
   - No "Total" shown on screenshot
   - orderTotal = $9.16 + $12.99 + $16.80 = $38.95

   ❌ WRONG APPROACH:
   - Screenshot shows items total $5.00 and final total $7.00
   - You use $5.00 ← THIS IS WRONG
   - ✅ You should use $7.00 (the final total with taxes/fees)

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

PLATFORM DETECTION - PRIORITY ORDER (ONLY Amazon, Shein, Temu):

🔴 STEP 1: SCAN FOR TEXT FIRST (highest priority - may be in Spanish):
- Look for "SHEIN", "shein.com" → company = "Shein"
- Look for "Amazon", "amazon.com" → company = "Amazon"
- Look for "Temu", "temu.com" → company = "Temu"
- ANY other company → company = null (ONLY these 3 accepted)

🔴 STEP 2: IF NO TEXT, USE VISUAL CUES (Spanish screenshots OK):
- **BLACK header + clean modern UI + fashion items** → "Shein"
  ✅ Even if shows vendors like "SHEIN LUNE CURVE", "Ray's Playhouse" ← IGNORE vendor names!
  ✅ Spanish screenshot? Still extract "Shein"
- **BLUE header + orange smile logo area** → "Amazon"
  ✅ Even if showing "Sold by [ThirdPartySeller]" ← IGNORE seller names!
- **Bright ORANGE + modern UI + aggressive pricing** → "Temu"
  ✅ Even if showing supplier names ← IGNORE supplier names!
  ✅ "Shop Like a Billionaire" slogan

🔴 KEY REMINDERS:
- ONLY extract Amazon, Shein, or Temu (all others = null)
- Spanish screenshots are normal for El Salvador
- Extract PLATFORM from header/design, IGNORE vendor names in product listings
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
      "name": "item name",
      "description": "item description",
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
✓ 🔴 MOST IMPORTANT: Did you look for "Total", "Order Total", or "Grand Total" on the screenshot?
✓ 🔴 If a final total is shown, did you use THAT number as orderTotal (not the sum of items)?
✓ If NO final total is shown, orderTotal = sum of all item.totalValue values
✓ totalPieces = sum of all item.quantity values
✓ Company name is properly capitalized
✓ Tracking last 4 matches the actual last 4 of tracking number

⚠️ BEFORE YOU RESPOND - FINAL VALIDATION:

1. 🔴 🔴 🔴 FIRST: Is this a Google Shopping search, product listing, or random photo? If YES, return null/empty JSON immediately!

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
6. 🔴 TOTAL CHECK: Look at the bottom of the screenshot - is there a "Total" or "Order Total" WITH A $ SYMBOL?
7. If YES, use that exact number as orderTotal (it includes taxes/fees/shipping)
8. If NO, calculate orderTotal by summing all item totals
9. 🔴 FINAL CHECK: Does your orderTotal look reasonable? (If it's in millions/billions, you added a tracking number by mistake)

Return ONLY valid JSON, no markdown, no extra text.`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: 'image/png',
        data: base64Image
      }
    }
  ]);

  const responseText = result.response.text();

  // Extract JSON from response
  let jsonText = responseText;
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1].split('```')[0].trim();
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonText);

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
  // The AI should extract the final total from the screenshot (which includes taxes/fees)
  // This will be LARGER than the sum of items
  if (parsed.orderTotal && Math.abs(parsed.orderTotal - calculatedItemsTotal) > 0.01) {
    // Check if AI's total is LARGER than items total (suggests taxes/fees included - this is CORRECT)
    if (parsed.orderTotal > calculatedItemsTotal) {
      const difference = parsed.orderTotal - calculatedItemsTotal;
      console.log(`✓ Final total ($${parsed.orderTotal.toFixed(2)}) includes $${difference.toFixed(2)} in taxes/fees/shipping on top of items total ($${calculatedItemsTotal.toFixed(2)})`);
      // Trust the AI - they found the final total on the screenshot
    } else {
      // AI's total is LOWER than items total - this suggests they used wrong prices
      console.warn(`⚠️ Order total error: AI said $${parsed.orderTotal.toFixed(2)}, but items total is $${calculatedItemsTotal.toFixed(2)}`);
      console.warn('   AI probably used original prices instead of sale prices - using calculated total');
      parsed.orderTotal = calculatedItemsTotal; // Auto-correct
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

  return extractedData;
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
