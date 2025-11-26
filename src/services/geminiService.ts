import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PackageItem } from '../types';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

export const analyzePackagePhoto = async (base64Image: string): Promise<{
  trackingNumber?: string;
  carrier?: string;
  items: PackageItem[];
  origin?: string;
}> => {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are analyzing a shipping label or package documentation for an import business in El Salvador.
Extract the following information from this image:

1. Tracking number (if visible)
2. Shipping carrier (e.g., DHL, FedEx, USPS, UPS, Amazon)
3. Origin country/location
4. List of items/contents with:
   - Item name
   - Description (if available)
   - Quantity
   - Unit value in USD (if available, otherwise estimate based on typical retail prices)
   - Total value (quantity × unit value)
   - Weight in kg (if available)
   - Category (electronics, clothing, toys, food, etc.)
   - HS Code if mentioned (8-10 digit Harmonized System code)

Return the data in this exact JSON format:
{
  "trackingNumber": "tracking number or null",
  "carrier": "carrier name or null",
  "origin": "origin country or null",
  "items": [
    {
      "name": "item name",
      "description": "item description or null",
      "quantity": number,
      "unitValue": number (in USD),
      "totalValue": number (quantity × unitValue),
      "weight": number (in kg) or null,
      "category": "category name or null",
      "hsCode": "HS code or null"
    }
  ]
}

If you cannot find specific values, estimate them reasonably based on typical product values.
Return ONLY the JSON object, no other text.`;

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

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = responseText;
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1].split('```')[0].trim();
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonText);
  return parsed;
};

export const analyzeInvoicePhoto = async (base64Image: string): Promise<{
  invoiceNumber?: string;
  items: PackageItem[];
  totalValue: number;
  currency: string;
}> => {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are analyzing an invoice or packing list for an import business in El Salvador.
Extract the following information:

1. Invoice number
2. Currency (USD, EUR, etc.)
3. List all items with:
   - Item name/description
   - Quantity
   - Unit price
   - Total price
   - HS Code (if available)

Return in this JSON format:
{
  "invoiceNumber": "invoice number or null",
  "currency": "USD" (default if not specified),
  "items": [
    {
      "name": "item name",
      "description": "description or null",
      "quantity": number,
      "unitValue": number,
      "totalValue": number,
      "hsCode": "HS code or null"
    }
  ],
  "totalValue": sum of all item total values
}

Return ONLY the JSON object.`;

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

  let jsonText = responseText;
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1].split('```')[0].trim();
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonText);
  return parsed;
};
