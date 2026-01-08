/**
 * Mock AI Service for MVP
 * Returns sample extracted data without calling real AI APIs
 */

import type { ExtractedData } from '../types';

const MOCK_ITEMS = [
  { name: 'iPhone 15 Pro Max 256GB', quantity: 1, unitValue: 1199, category: 'electronics' },
  { name: 'AirPods Pro (2nd Generation)', quantity: 1, unitValue: 249, category: 'electronics' },
  { name: 'MacBook Pro 14" M3 Chip', quantity: 1, unitValue: 1999, category: 'electronics' },
  { name: 'Apple Watch Series 9', quantity: 1, unitValue: 399, category: 'electronics' },
  { name: 'USB-C Cable 2m', quantity: 2, unitValue: 19, category: 'electronics' },
  { name: 'MagSafe Charger', quantity: 1, unitValue: 39, category: 'electronics' },
  { name: 'Samsung Galaxy S24 Ultra', quantity: 1, unitValue: 1299, category: 'electronics' },
  { name: 'Sony WH-1000XM5 Headphones', quantity: 1, unitValue: 399, category: 'electronics' },
  { name: 'iPad Air 10.9" 256GB', quantity: 1, unitValue: 749, category: 'electronics' },
  { name: 'Logitech MX Master 3S Mouse', quantity: 1, unitValue: 99, category: 'electronics' }
];

const MOCK_SELLERS = [
  'Amazon.com',
  'Best Buy',
  'Apple Store',
  'Newegg',
  'B&H Photo',
  'Walmart',
  'Target'
];

const MOCK_TRACKING_PREFIXES = [
  '1Z999AA1',
  '1Z999BB2',
  '1Z999CC3',
  '926129',
  '420921',
  'TBA'
];

/**
 * Simulates AI extraction from order screenshot
 * Returns random sample data to demonstrate functionality
 */
export async function mockAnalyzeOrderScreenshot(base64Image: string): Promise<ExtractedData> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));

  // Randomly select 1-3 items
  const numItems = Math.floor(Math.random() * 3) + 1;
  const selectedItems = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < numItems; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * MOCK_ITEMS.length);
    } while (usedIndices.has(idx));

    usedIndices.add(idx);
    const item = MOCK_ITEMS[idx];
    selectedItems.push({
      ...item,
      totalValue: item.quantity * item.unitValue
    });
  }

  // Generate mock tracking number
  const trackingPrefix = MOCK_TRACKING_PREFIXES[Math.floor(Math.random() * MOCK_TRACKING_PREFIXES.length)];
  const trackingNumber = `${trackingPrefix}${Math.floor(Math.random() * 900000) + 100000}`;

  // Generate mock order number
  const orderNumber = `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000000) + 1000000}`;

  // Random seller
  const seller = MOCK_SELLERS[Math.floor(Math.random() * MOCK_SELLERS.length)];

  // Random date in last 7 days
  const daysAgo = Math.floor(Math.random() * 7);
  const orderDate = new Date();
  orderDate.setDate(orderDate.getDate() - daysAgo);

  return {
    trackingNumber,
    orderNumber,
    seller,
    orderDate: orderDate.toISOString().split('T')[0],
    items: selectedItems,
    orderTotal: selectedItems.reduce((sum, item) => sum + item.totalValue, 0)
  };
}

/**
 * Returns sample batch data for demo purposes
 */
export function getMockBatchData() {
  return {
    customerName: 'Maria Rodriguez',
    screenshots: [
      {
        id: 'mock-1',
        source: 'whatsapp' as const,
        extractionStatus: 'completed' as const,
        extractedData: {
          trackingNumber: '1Z999AA1234567',
          orderNumber: '112-3456789',
          seller: 'Amazon.com',
          orderDate: '2025-11-25',
          items: [
            { name: 'iPhone 15 Pro Max 256GB', quantity: 1, unitValue: 1199, totalValue: 1199, category: 'electronics' }
          ],
          orderTotal: 1199
        }
      },
      {
        id: 'mock-2',
        source: 'manual' as const,
        extractionStatus: 'completed' as const,
        extractedData: {
          trackingNumber: '1Z999BB7654321',
          orderNumber: '113-9876543',
          seller: 'Best Buy',
          orderDate: '2025-11-26',
          items: [
            { name: 'AirPods Pro (2nd Generation)', quantity: 1, unitValue: 249, totalValue: 249, category: 'electronics' },
            { name: 'USB-C Cable 2m', quantity: 2, unitValue: 19, totalValue: 38, category: 'electronics' }
          ],
          orderTotal: 287
        }
      }
    ],
    totalValue: 1486,
    totalItems: 3
  };
}

/**
 * Mock Cloud Function response for processing batch
 */
export async function mockProcessBatch(batchId: string, customerName: string) {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  const mockData = getMockBatchData();

  return {
    success: true,
    packageId: `pkg-${Date.now()}`,
    packageNumber: `PKG-2025-11-${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`,
    customerName,
    totalItems: mockData.totalItems,
    totalValue: mockData.totalValue,
    customsDuty: mockData.totalValue * 0.05, // 5%
    vat: mockData.totalValue * 0.13, // 13%
    totalFees: (mockData.totalValue * 0.05) + (mockData.totalValue * 0.13),
    googleDocUrl: 'https://docs.google.com/document/d/MOCK_DOCUMENT_ID/edit',
    sheetsUrl: 'https://docs.google.com/spreadsheets/d/MOCK_SHEET_ID/edit'
  };
}
