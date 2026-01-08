/**
 * Shared Doc Context
 *
 * Centralizes all doc and screenshot data across:
 * - Doc Manager
 * - WhatsApp Inquiries
 * - App Inquiries
 *
 * Includes realistic AI-extracted data simulation
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import type { Doc, Screenshot } from '../types';

interface DocContextType {
  docs: Doc[];
  screenshots: Screenshot[];
  loading: boolean;
  refreshData: () => void;
  addDoc: (doc: Omit<Doc, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateDoc: (id: string, updates: Partial<Doc>) => Promise<void>;
  deleteDoc: (id: string) => Promise<void>;
  addScreenshot: (screenshot: Omit<Screenshot, 'id' | 'uploadedAt'>) => Promise<string>;
}

const DocContext = createContext<DocContextType | undefined>(undefined);

export function useDocs() {
  const context = useContext(DocContext);
  if (!context) {
    throw new Error('useDocs must be used within DocProvider');
  }
  return context;
}

export function DocProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Load mock data with realistic AI extractions
  useEffect(() => {
    if (!currentUser) return;

    loadMockData();
  }, [currentUser]);

  const loadMockData = () => {
    console.log('📊 Loading centralized doc data with AI extractions...');

    // Realistic AI-extracted screenshots with full data
    const mockScreenshots: Screenshot[] = [
      // WhatsApp Screenshot 1 - Amazon Order
      {
        id: 'screenshot-1',
        docId: 'doc-1',
        organizationId: currentUser?.organizationId || 'test-org',
        source: 'whatsapp',
        customerName: 'Maria Rodriguez',
        phoneNumber: '+503 7845-1234',
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageType: 'image/png',
        extractionStatus: 'completed',
        uploadedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        processedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
        extractedData: {
          trackingNumber: '1Z999AA10123456784',
          orderNumber: 'AMZ-112-7894561',
          seller: 'Amazon.com',
          orderDate: '2024-11-28',
          orderTotal: 168.98,
          items: [
            {
              name: 'Wireless Keyboard',
              quantity: 1,
              unitValue: 79.99,
              totalValue: 79.99,
              hsCode: '8471.60.00',
              weight: 0.5,
              category: 'Electronics'
            },
            {
              name: 'USB-C Cable (2-Pack)',
              quantity: 1,
              unitValue: 39.99,
              totalValue: 39.99,
              hsCode: '8544.42.00',
              weight: 0.2,
              category: 'Electronics'
            },
            {
              name: 'Phone Case',
              quantity: 1,
              unitValue: 49.00,
              totalValue: 49.00,
              hsCode: '3926.90.00',
              weight: 0.1,
              category: 'Accessories'
            }
          ]
        }
      },

      // WhatsApp Screenshot 2 - Nike Order (same customer, second order)
      {
        id: 'screenshot-2',
        docId: 'doc-1',
        organizationId: currentUser?.organizationId || 'test-org',
        source: 'whatsapp',
        customerName: 'Maria Rodriguez',
        phoneNumber: '+503 7845-1234',
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageType: 'image/png',
        extractionStatus: 'completed',
        uploadedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        processedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
        extractedData: {
          trackingNumber: '9274899998901234567890',
          orderNumber: 'NIKE-2024-45678',
          seller: 'Nike.com',
          orderDate: '2024-11-27',
          orderTotal: 389.97,
          items: [
            {
              name: 'Nike Air Max 270 - Black/White',
              quantity: 2,
              unitValue: 150.00,
              totalValue: 300.00,
              hsCode: '6404.19.00',
              weight: 1.5,
              category: 'Footwear'
            },
            {
              name: 'Nike Dri-FIT Running Shirt',
              quantity: 3,
              unitValue: 29.99,
              totalValue: 89.97,
              hsCode: '6109.90.00',
              weight: 0.6,
              category: 'Apparel'
            }
          ]
        }
      },

      // App Inquiry Screenshot 3 - Carlos Mendez Order (Completed)
      {
        id: 'screenshot-3',
        docId: 'doc-2',
        organizationId: currentUser?.organizationId || 'test-org',
        source: 'manual',
        customerName: 'Carlos Mendez',
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageType: 'image/png',
        extractionStatus: 'completed',
        uploadedAt: new Date(Date.now() - 30 * 60 * 1000),
        processedAt: new Date(Date.now() - 25 * 60 * 1000),
        extractedData: {
          trackingNumber: '1Z999CC30456789012',
          orderNumber: 'AMZ-2024-98765',
          seller: 'Amazon.com',
          orderDate: '2024-11-26',
          orderTotal: 89.99,
          items: [
            {
              name: 'Bluetooth Headphones',
              quantity: 1,
              unitValue: 89.99,
              totalValue: 89.99,
              hsCode: '8518.30.00',
              weight: 0.4,
              category: 'Electronics'
            }
          ]
        }
      },

      // WhatsApp Screenshot 4 - Best Buy Order (Completed)
      {
        id: 'screenshot-4',
        docId: 'doc-2',
        organizationId: currentUser?.organizationId || 'test-org',
        source: 'whatsapp',
        customerName: 'Ana Garcia',
        phoneNumber: '+503 6123-9999',
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageType: 'image/png',
        extractionStatus: 'completed',
        uploadedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        processedAt: new Date(Date.now() - 23.5 * 60 * 60 * 1000),
        extractedData: {
          trackingNumber: 'FEDEX-789456123000',
          orderNumber: 'BBY01-7894561234',
          seller: 'Best Buy',
          orderDate: '2024-11-25',
          orderTotal: 348.97,
          items: [
            {
              name: 'Webcam HD 1080p',
              quantity: 1,
              unitValue: 89.99,
              totalValue: 89.99,
              hsCode: '8525.80.00',
              weight: 0.3,
              category: 'Electronics'
            },
            {
              name: 'Bluetooth Speaker',
              quantity: 1,
              unitValue: 159.99,
              totalValue: 159.99,
              hsCode: '8518.22.00',
              weight: 1.2,
              category: 'Electronics'
            },
            {
              name: 'External Hard Drive 2TB',
              quantity: 1,
              unitValue: 98.99,
              totalValue: 98.99,
              hsCode: '8471.70.00',
              weight: 0.5,
              category: 'Electronics'
            }
          ]
        }
      },

      // Unassigned WhatsApp Screenshot - Pending
      {
        id: 'screenshot-5',
        organizationId: currentUser?.organizationId || 'test-org',
        source: 'whatsapp',
        customerName: 'Roberto Santos',
        phoneNumber: '+503 7222-3333',
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageType: 'image/png',
        extractionStatus: 'pending',
        uploadedAt: new Date(Date.now() - 10 * 60 * 1000),
        extractedData: undefined
      }
    ];

    // Docs that correspond to the screenshots
    const mockDocs: Doc[] = [
      {
        id: 'doc-1',
        organizationId: currentUser?.organizationId || 'test-org',
        importerId: currentUser?.uid || 'default',
        customerName: 'December Electronics Shipment',
        status: 'draft',
        screenshotIds: ['screenshot-1', 'screenshot-2'],
        screenshotCount: 2,
        weight: 10.5,
        weightUnit: 'kg',
        hasWhatsAppScreenshots: true,
        hasManualScreenshots: false,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000)
      },
      {
        id: 'doc-2',
        organizationId: currentUser?.organizationId || 'test-org',
        importerId: currentUser?.uid || 'default',
        customerName: 'November Mixed Order',
        status: 'draft',
        screenshotIds: ['screenshot-3', 'screenshot-4'],
        screenshotCount: 2,
        weight: 15.0,
        weightUnit: 'kg',
        hasWhatsAppScreenshots: true,
        hasManualScreenshots: true,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
      },
      {
        id: 'doc-3',
        organizationId: currentUser?.organizationId || 'test-org',
        importerId: currentUser?.uid || 'default',
        customerName: 'Test Empty Doc',
        status: 'draft',
        screenshotIds: [],
        screenshotCount: 0,
        hasWhatsAppScreenshots: false,
        hasManualScreenshots: false,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
      }
    ];

    setDocs(mockDocs);
    setScreenshots(mockScreenshots);
    setLoading(false);

    console.log('✅ Loaded docs:', mockDocs.length);
    console.log('✅ Loaded screenshots:', mockScreenshots.length);
    console.log('✅ AI Extractions:', mockScreenshots.filter(s => s.extractionStatus === 'completed').length);
  };

  const refreshData = () => {
    loadMockData();
  };

  const addDoc = async (docData: Omit<Doc, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const newDoc: Doc = {
      ...docData,
      id: `doc-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setDocs(prev => [...prev, newDoc]);
    console.log('✅ Doc added:', newDoc.id);
    return newDoc.id;
  };

  const updateDoc = async (id: string, updates: Partial<Doc>): Promise<void> => {
    setDocs(prev => prev.map(doc =>
      doc.id === id
        ? { ...doc, ...updates, updatedAt: new Date() }
        : doc
    ));
    console.log('✅ Doc updated:', id);
  };

  const deleteDoc = async (id: string): Promise<void> => {
    setDocs(prev => prev.filter(doc => doc.id !== id));
    setScreenshots(prev => prev.filter(screenshot => screenshot.docId !== id));
    console.log('✅ Doc deleted:', id);
  };

  const addScreenshot = async (screenshotData: Omit<Screenshot, 'id' | 'uploadedAt'>): Promise<string> => {
    const newScreenshot: Screenshot = {
      ...screenshotData,
      id: `screenshot-${Date.now()}`,
      uploadedAt: new Date()
    };

    setScreenshots(prev => [...prev, newScreenshot]);

    // Update doc screenshot count
    if (newScreenshot.docId) {
      await updateDoc(newScreenshot.docId, {
        screenshotCount: screenshots.filter(s => s.docId === newScreenshot.docId).length + 1
      });
    }

    console.log('✅ Screenshot added:', newScreenshot.id);
    return newScreenshot.id;
  };

  return (
    <DocContext.Provider
      value={{
        docs,
        screenshots,
        loading,
        refreshData,
        addDoc,
        updateDoc,
        deleteDoc,
        addScreenshot
      }}
    >
      {children}
    </DocContext.Provider>
  );
}
