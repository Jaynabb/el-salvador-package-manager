"use strict";
/**
 * Duty Calculator
 * Calculate customs duty and VAT for El Salvador
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDuty = calculateDuty;
const EL_SALVADOR_VAT_RATE = 0.13; // 13% VAT
const DUTY_FREE_THRESHOLD = 300; // $300 USD for personal use
const DEFAULT_DUTY_RATE = 0.15; // 15% fallback duty rate
// HS Code specific duty rates for El Salvador
const HS_CODE_DUTY_RATES = {
    "8517": 0.05, // Phones and telecom equipment - 5%
    "8471": 0.05, // Computers - 5%
    "8518": 0.10, // Audio equipment - 10%
    "6403": 0.15, // Footwear - 15%
    "6204": 0.15, // Women's clothing - 15%
    "9503": 0.20, // Toys - 20%
    "3304": 0.10, // Cosmetics - 10%
};
/**
 * Calculate customs duty, VAT, and total fees for a package
 * Based on El Salvador customs regulations
 */
function calculateDuty(totalValue, items) {
    // Personal imports under $300 are duty-free
    if (totalValue <= DUTY_FREE_THRESHOLD) {
        const vat = totalValue * EL_SALVADOR_VAT_RATE;
        return {
            duty: 0,
            vat: parseFloat(vat.toFixed(2)),
            totalFees: parseFloat(vat.toFixed(2)),
        };
    }
    // Calculate duty based on HS codes if available
    let totalDuty = 0;
    for (const item of items) {
        let dutyRate = DEFAULT_DUTY_RATE;
        if (item.hsCode) {
            // Match first 4 digits of HS code
            const hsPrefix = item.hsCode.substring(0, 4);
            if (HS_CODE_DUTY_RATES[hsPrefix]) {
                dutyRate = HS_CODE_DUTY_RATES[hsPrefix];
            }
        }
        totalDuty += item.totalValue * dutyRate;
    }
    // Calculate VAT (applied to total value + duty)
    const taxableValue = totalValue + totalDuty;
    const vat = taxableValue * EL_SALVADOR_VAT_RATE;
    const totalFees = totalDuty + vat;
    return {
        duty: parseFloat(totalDuty.toFixed(2)),
        vat: parseFloat(vat.toFixed(2)),
        totalFees: parseFloat(totalFees.toFixed(2)),
    };
}
//# sourceMappingURL=dutyCalculator.js.map