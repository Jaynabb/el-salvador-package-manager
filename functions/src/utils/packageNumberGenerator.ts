/**
 * Package Number Generator
 * Generate sequential package numbers
 */

import {getFirestore} from "firebase-admin/firestore";

/**
 * Generate sequential package number
 * Format: PKG-YYYY-MM-###
 * Example: PKG-2025-11-001, PKG-2025-11-002, etc.
 * Resets numbering each month
 */
export async function generatePackageNumber(): Promise<string> {
  const db = getFirestore();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // Query for the last package number this month
  const startRange = `PKG-${year}-${month}-000`;
  const endRange = `PKG-${year}-${month}-999`;

  const snapshot = await db.collection("packages")
    .where("packageNumber", ">=", startRange)
    .where("packageNumber", "<=", endRange)
    .orderBy("packageNumber", "desc")
    .limit(1)
    .get();

  let nextNumber = 1;

  if (!snapshot.empty) {
    const lastPackageNumber = snapshot.docs[0].data().packageNumber;
    // Extract number from "PKG-2025-11-005" -> "005" -> 5
    const lastNum = parseInt(lastPackageNumber.split("-").pop() || "0");
    nextNumber = lastNum + 1;
  }

  // Format with leading zeros (001, 002, etc.)
  const packageNumber = `PKG-${year}-${month}-${String(nextNumber).padStart(3, "0")}`;

  return packageNumber;
}
