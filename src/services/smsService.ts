import type { Package } from '../types';
import { addSMSNotification, updateSMSNotification } from './firestoreClient';

/**
 * SMS Service using Twilio (or other SMS provider)
 *
 * Note: This requires a backend API endpoint for security.
 * Twilio credentials should NEVER be exposed in frontend code.
 *
 * For production:
 * 1. Create a backend API endpoint (e.g., Firebase Functions, Express server)
 * 2. That endpoint should handle Twilio API calls
 * 3. Frontend calls your backend API
 *
 * This is a mock implementation for demonstration.
 */

export interface SMSTemplate {
  type: 'package_received' | 'ready_for_pickup' | 'delivered' | 'customs_cleared';
  getMessage: (pkg: Package) => string;
}

const SMS_TEMPLATES: Record<SMSTemplate['type'], (pkg: Package) => string> = {
  package_received: (pkg: Package) =>
    `ImportFlow: Your package ${pkg.trackingNumber} has been received! We'll notify you when it's ready for pickup. Track: importflow.com/${pkg.id}`,

  customs_cleared: (pkg: Package) =>
    `ImportFlow: Package ${pkg.trackingNumber} cleared customs. Fees: $${pkg.totalFees.toFixed(2)}. Preparing for pickup.`,

  ready_for_pickup: (pkg: Package) =>
    `ImportFlow: Package ${pkg.trackingNumber} is ready for pickup! Total: $${pkg.totalFees.toFixed(2)}. Hours: Mon-Fri 9AM-6PM. Location: [Your Address]`,

  delivered: (pkg: Package) =>
    `ImportFlow: Package ${pkg.trackingNumber} delivered! Thank you for using ImportFlow. Rate us: importflow.com/rate`
};

/**
 * Send SMS notification (mock - needs backend implementation)
 */
export const sendSMS = async (
  phone: string,
  message: string,
  packageId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Log the notification to Firestore
    const notificationId = await addSMSNotification({
      packageId: packageId || '',
      customerPhone: phone,
      message,
      status: 'pending'
    });

    // In production, call your backend API here
    // const response = await fetch('/api/send-sms', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ phone, message })
    // });

    // For now, simulate sending (in production, this would actually send via Twilio)
    console.log(`[SMS] To: ${phone}`);
    console.log(`[SMS] Message: ${message}`);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update notification status
    await updateSMSNotification(notificationId, {
      status: 'sent',
      sentAt: new Date()
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send SMS:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Send package status notification
 */
export const sendPackageNotification = async (
  pkg: Package,
  type: SMSTemplate['type']
): Promise<{ success: boolean; error?: string }> => {
  const message = SMS_TEMPLATES[type](pkg);
  return sendSMS(pkg.customerPhone, message, pkg.id);
};

/**
 * Send custom SMS
 */
export const sendCustomSMS = async (
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> => {
  return sendSMS(phone, message);
};
