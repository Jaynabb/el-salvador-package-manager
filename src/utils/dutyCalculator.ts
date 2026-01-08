import type { PackageItem, CustomsDeclaration } from '../types';

// El Salvador VAT rate
const VAT_RATE = 0.13; // 13%

// Duty-free threshold for personal packages
const DUTY_FREE_THRESHOLD = 300; // USD

/**
 * Calculate import duties for El Salvador
 * Packages under $300 USD are exempt from import tariffs but pay 13% VAT
 * Packages over $300 USD pay import duties + 13% VAT
 */
export interface DutyCalculation {
  declaredValue: number;
  isDutyFree: boolean;
  importDuty: number;
  vat: number;
  totalFees: number;
}

export const calculateDuty = (
  items: PackageItem[],
  purpose: CustomsDeclaration['purpose'] = 'personal'
): DutyCalculation => {
  // Calculate total declared value
  const declaredValue = items.reduce((sum, item) => sum + item.totalValue, 0);

  // Check if duty-free (under $300 for personal use)
  const isDutyFree = purpose === 'personal' && declaredValue < DUTY_FREE_THRESHOLD;

  // Calculate import duty (0% if duty-free, otherwise varies by product category)
  // For simplicity, we'll use a flat 15% rate for non-duty-free items
  // In reality, this would be determined by HS codes
  const importDutyRate = isDutyFree ? 0 : 0.15;
  const importDuty = declaredValue * importDutyRate;

  // Calculate VAT (13% on declared value + import duty)
  const vatBase = declaredValue + importDuty;
  const vat = vatBase * VAT_RATE;

  // Total fees
  const totalFees = importDuty + vat;

  return {
    declaredValue,
    isDutyFree,
    importDuty: Math.round(importDuty * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100
  };
};

/**
 * Get duty rate by HS code (simplified)
 * In a real implementation, this would query an HS code database
 */
export const getDutyRateByHSCode = (hsCode: string): number => {
  // This is a simplified example
  // In reality, you'd have a comprehensive HS code database
  const firstTwoDigits = hsCode.substring(0, 2);

  // Example rates (not exhaustive)
  const rates: Record<string, number> = {
    '61': 0.15, // Clothing
    '62': 0.15, // Clothing
    '64': 0.10, // Footwear
    '85': 0.05, // Electronics
    '84': 0.05, // Machinery
    '95': 0.20, // Toys
  };

  return rates[firstTwoDigits] || 0.15; // Default 15%
};

/**
 * Format currency for display
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};
