import type { Screenshot, Doc } from '../types';

/**
 * Tax Split Detection Service
 * Detects when importers are splitting orders across "dummy names" to avoid tax thresholds
 */

export interface TaxSplitResult {
  isTaxSplit: boolean;
  reason?: string;
  totalValue: number;
  customerGroups: Array<{
    name: string;
    value: number;
    screenshotIds: string[];
  }>;
}

/**
 * Detect if a doc contains tax split scenarios
 * Rules:
 * 1. Total value > $200
 * 2. Same first name, different last names
 * 3. Multiple "customers" in same doc with similar names
 */
export const detectTaxSplit = (doc: Doc, screenshots: Screenshot[]): TaxSplitResult => {
  // Calculate total value
  const totalValue = screenshots.reduce((sum, s) =>
    sum + (s.extractedData?.orderTotal || 0), 0
  );

  // If total value <= $200, no tax split needed
  if (totalValue <= 200) {
    return {
      isTaxSplit: false,
      totalValue,
      customerGroups: []
    };
  }

  // Group screenshots by customer name
  const customerGroups = new Map<string, { value: number; screenshotIds: string[] }>();

  screenshots.forEach(screenshot => {
    const customerName = screenshot.extractedData?.customerName || screenshot.customerName || 'Unknown';
    const orderValue = screenshot.extractedData?.orderTotal || 0;

    if (!customerGroups.has(customerName)) {
      customerGroups.set(customerName, { value: 0, screenshotIds: [] });
    }

    const group = customerGroups.get(customerName)!;
    group.value += orderValue;
    group.screenshotIds.push(screenshot.id);
  });

  // Convert to array for analysis
  const groups = Array.from(customerGroups.entries()).map(([name, data]) => ({
    name,
    value: data.value,
    screenshotIds: data.screenshotIds
  }));

  // If only one customer, no split detected
  if (groups.length === 1) {
    return {
      isTaxSplit: false,
      totalValue,
      customerGroups: groups
    };
  }

  // Check for same first name, different last names pattern
  const taxSplitDetected = checkSameFirstNamePattern(groups);

  if (taxSplitDetected) {
    return {
      isTaxSplit: true,
      reason: `Total value $${totalValue.toFixed(2)} > $200 threshold. Detected ${groups.length} different names with same first name pattern.`,
      totalValue,
      customerGroups: groups
    };
  }

  // Check if total value is significantly higher than $200 with multiple names
  if (totalValue > 250 && groups.length > 1) {
    return {
      isTaxSplit: true,
      reason: `Total value $${totalValue.toFixed(2)} split across ${groups.length} different customer names.`,
      totalValue,
      customerGroups: groups
    };
  }

  return {
    isTaxSplit: false,
    totalValue,
    customerGroups: groups
  };
};

/**
 * Check if customer names follow "same first name, different last name" pattern
 * Example: "Maria Lopez" and "Maria Garcia"
 */
function checkSameFirstNamePattern(groups: Array<{ name: string; value: number; screenshotIds: string[] }>): boolean {
  if (groups.length < 2) return false;

  // Extract first names
  const firstNames = groups.map(g => {
    const nameParts = g.name.trim().split(/\s+/);
    return nameParts[0]?.toLowerCase();
  }).filter(Boolean);

  // Check if there are duplicate first names with different full names
  const firstNameCounts = new Map<string, number>();
  firstNames.forEach(firstName => {
    firstNameCounts.set(firstName, (firstNameCounts.get(firstName) || 0) + 1);
  });

  // If any first name appears more than once, it's a potential tax split
  return Array.from(firstNameCounts.values()).some(count => count > 1);
}

/**
 * Get suggested name splits for tax purposes
 * Returns how to split a name into multiple "dummy names"
 */
export const suggestNameSplits = (originalName: string, targetValue: number): string[] => {
  const nameParts = originalName.trim().split(/\s+/);

  if (nameParts.length < 2) {
    return [originalName]; // Can't split a single name
  }

  const firstName = nameParts[0];
  const commonLastNames = [
    'Lopez', 'Garcia', 'Rodriguez', 'Martinez', 'Hernandez',
    'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres',
    'Flores', 'Rivera', 'Gomez', 'Diaz', 'Cruz'
  ];

  // Calculate how many splits needed (each under $200)
  const numSplits = Math.ceil(targetValue / 199);

  const suggestedNames: string[] = [];
  suggestedNames.push(originalName); // Keep original as first

  // Add variations with common last names
  for (let i = 1; i < numSplits && i < commonLastNames.length; i++) {
    suggestedNames.push(`${firstName} ${commonLastNames[i]}`);
  }

  return suggestedNames;
};

/**
 * Calculate recommended split values to stay under $200 threshold
 */
export const calculateSplitValues = (totalValue: number): number[] => {
  const maxPerSplit = 199;
  const numSplits = Math.ceil(totalValue / maxPerSplit);
  const baseValue = Math.floor(totalValue / numSplits);
  const remainder = totalValue - (baseValue * numSplits);

  const splits: number[] = [];
  for (let i = 0; i < numSplits; i++) {
    splits.push(baseValue + (i < remainder ? 1 : 0));
  }

  return splits;
};
