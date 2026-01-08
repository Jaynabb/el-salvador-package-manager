# AI Extraction Fields - What Gemini AI Extracts from Screenshots

## Overview
When a screenshot is uploaded (via WhatsApp or manually), Google Gemini AI analyzes the image and extracts structured data for customs documentation.

---

## Extracted Fields

### 1. **Tracking Number** 📦
- **Field:** `trackingNumber`
- **Type:** String
- **Example:** `"1Z999AA10123456789"`
- **What it extracts:** Shipping tracking number from carriers like:
  - UPS (1Z...)
  - FedEx (12-14 digits)
  - USPS (20-22 digits)
  - DHL (10-11 digits)
  - Amazon (TBA...)

### 2. **Order Number** 🔢
- **Field:** `orderNumber`
- **Type:** String
- **Example:** `"112-1234567-8901234"`
- **What it extracts:**
  - Amazon order numbers (xxx-xxxxxxx-xxxxxxx)
  - eBay order numbers
  - Walmart order IDs
  - General e-commerce order numbers

### 3. **Seller/Store** 🏪
- **Field:** `seller`
- **Type:** String
- **Example:** `"Amazon"`, `"eBay"`, `"Walmart"`
- **What it extracts:** Merchant or store name from the receipt

### 4. **Order Date** 📅
- **Field:** `orderDate`
- **Type:** String (ISO date format)
- **Example:** `"2024-11-25"`
- **What it extracts:** Date the order was placed

### 5. **Items Array** 📋
Each screenshot can have multiple items. For each item, the AI extracts:

#### 5a. **Item Name**
- **Field:** `items[].name`
- **Type:** String
- **Example:** `"iPhone 15 Case - Clear"`
- **What it extracts:** Full product name/description

#### 5b. **Quantity**
- **Field:** `items[].quantity`
- **Type:** Number
- **Example:** `5`
- **What it extracts:** Number of units ordered

#### 5c. **Unit Value (Price per item)**
- **Field:** `items[].unitValue`
- **Type:** Number (USD)
- **Example:** `20.00`
- **What it extracts:** Price for ONE unit

#### 5d. **Total Value (Quantity × Unit Price)**
- **Field:** `items[].totalValue`
- **Type:** Number (USD)
- **Example:** `100.00` (5 × $20.00)
- **What it extracts:** Total cost for this line item

#### 5e. **HS Code (Optional)**
- **Field:** `items[].hsCode`
- **Type:** String
- **Example:** `"3926.90"` (for plastic cases)
- **What it extracts:** Harmonized System code if visible on receipt
- **Note:** Usually requires manual entry for customs

#### 5f. **Weight (Optional)**
- **Field:** `items[].weight`
- **Type:** Number (kg)
- **Example:** `0.05`
- **What it extracts:** Item weight if listed

#### 5g. **Category (Optional)**
- **Field:** `items[].category`
- **Type:** String
- **Example:** `"Electronics Accessories"`
- **What it extracts:** Product category if visible

### 6. **Order Total** 💰
- **Field:** `orderTotal`
- **Type:** Number (USD)
- **Example:** `157.50`
- **What it extracts:**
  - Grand total from receipt
  - OR sum of all item totals
  - Includes subtotal + tax + shipping if visible

---

## Example Extracted Data

### Screenshot: Amazon Order Receipt

```json
{
  "trackingNumber": "1Z999AA10123456789",
  "orderNumber": "112-1234567-8901234",
  "seller": "Amazon",
  "orderDate": "2024-11-25",
  "items": [
    {
      "name": "iPhone 15 Pro Clear Case with MagSafe",
      "quantity": 5,
      "unitValue": 20.00,
      "totalValue": 100.00,
      "hsCode": "",
      "category": "Cell Phone Accessories"
    },
    {
      "name": "USB-C to Lightning Cable 2m",
      "quantity": 3,
      "unitValue": 15.00,
      "totalValue": 45.00,
      "hsCode": "",
      "category": "Electronics"
    },
    {
      "name": "Universal Phone Holder",
      "quantity": 1,
      "unitValue": 12.50,
      "totalValue": 12.50,
      "hsCode": "",
      "category": "Automotive Accessories"
    }
  ],
  "orderTotal": 157.50
}
```

---

## What AI CANNOT Extract (Requires Manual Entry)

❌ **Customer Information:**
- Customer name (comes from WhatsApp sender or manual entry)
- Customer phone number
- Customer email
- Delivery address

❌ **Package Information:**
- Package weight (must be provided by importer)
- Package dimensions
- Number of boxes

❌ **Customs Information:**
- HS Codes (rarely on receipts, must be added manually)
- Country of origin (unless on receipt)
- Certificate of origin
- Special permits

❌ **Shipping Costs:**
- International shipping fees
- Customs duties
- VAT calculations
- Handling fees

---

## AI Accuracy & Verification

### What AI is Good At (95%+ accuracy):
✅ Tracking numbers (if clearly visible)
✅ Order numbers
✅ Item names
✅ Quantities (when formatted as "Qty: X")
✅ Individual prices
✅ Totals

### What AI Struggles With (Requires Verification):
⚠️ Handwritten text
⚠️ Low-quality/blurry images
⚠️ Multiple items with similar names
⚠️ Mixed currencies
⚠️ Non-standard receipt formats
⚠️ Partial screenshots

### Verification Workflow:
1. AI extracts data automatically
2. **User verifies** data against screenshot (side-by-side view)
3. **User edits** any incorrect fields
4. **User adds** missing HS codes, weight, etc.
5. **User saves** verified data
6. Data goes to customs document

---

## How to Improve AI Accuracy

### Screenshot Best Practices:
✅ Full screenshot (don't crop important info)
✅ Good lighting (readable text)
✅ High resolution
✅ Include order summary section
✅ Include tracking number if visible
✅ Capture entire item list

### What to Avoid:
❌ Partial screenshots
❌ Blurry photos
❌ Photos of screens (use screenshot instead)
❌ Multiple orders in one image
❌ Heavily compressed images

---

## Processing Status

Each screenshot goes through these statuses:

1. **⏳ Pending** - Uploaded, waiting for AI
2. **⏳ Processing** - AI is analyzing
3. **✅ Completed** - Data extracted successfully
4. **❌ Error** - AI failed (retry or manual entry)

---

## Full Data Flow

```
Screenshot Upload
    ↓
AI Extraction (Gemini API)
    ↓
Extracted Data Saved to Firestore
    ↓
User Verifies Data (side-by-side view)
    ↓
User Edits/Adds Missing Fields
    ↓
User Saves Final Data
    ↓
Data Added to Batch
    ↓
Batch Exported to Google Doc
    ↓
Document Submitted to Customs
```

---

## Technical Implementation

**AI Service:** `src/services/geminiService.ts`
**Model:** Google Gemini 1.5 Flash
**Function:** `analyzePackagePhoto(base64Image)`

**Returns:** `ExtractedOrderData` interface (see `src/types.ts`)

```typescript
export interface ExtractedOrderData {
  trackingNumber?: string;
  orderNumber?: string;
  seller?: string;
  orderDate?: string;
  items: PackageItem[];
  orderTotal?: number;
}

export interface PackageItem {
  name: string;
  description?: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  hsCode?: string;
  weight?: number;
  category?: string;
}
```

---

**Summary:** AI extracts the structured order data automatically, but humans must verify and add customs-specific fields (HS codes, weight, etc.) before submission.
