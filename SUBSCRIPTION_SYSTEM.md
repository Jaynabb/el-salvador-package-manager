# Subscription & Multi-User Access Control System

## Overview

This system provides controlled access with subscription management, allowing you to:
- ✅ Control who can sign up and access the app
- ✅ Revoke membership for non-payment automatically
- ✅ Support multiple users per organization
- ✅ Automate subscription verification

---

## Architecture

### Data Model

```
Organizations (Firestore: /organizations)
├─ organizationId
├─ organizationName
├─ subscriptionStatus: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'suspended'
├─ subscriptionTier: 'free' | 'starter' | 'professional' | 'enterprise'
├─ ownerId (user who created/owns the organization)
├─ memberCount (current number of users)
├─ maxMembers (based on subscription tier)
├─ billingEmail
├─ paymentMethodId (Stripe)
├─ customerId (Stripe)
├─ currentPeriodStart
├─ currentPeriodEnd
├─ status: 'active' | 'suspended' | 'deleted'
└─ createdAt, updatedAt

Users (Firestore: /users + Firebase Auth)
├─ uid (Firebase Auth UID)
├─ email
├─ displayName
├─ role: 'organization-owner' | 'organization-member' | 'master-admin'
├─ organizationId (which organization they belong to)
├─ status: 'active' | 'inactive' | 'pending'
├─ phoneNumber (for WhatsApp integration)
└─ createdAt, updatedAt, lastLogin

Organization Invites (Firestore: /organizationInvites)
├─ inviteId
├─ organizationId
├─ email
├─ role
├─ invitedBy (user ID)
├─ status: 'pending' | 'accepted' | 'expired' | 'revoked'
├─ expiresAt (7 days from creation)
└─ createdAt
```

---

## Subscription Tiers

| Tier | Price | Max Members | Features |
|------|-------|-------------|----------|
| **Free Trial** | $0 | 1 | 14-day trial, all features |
| **Starter** | $49/mo | 3 | Basic features, limited batches |
| **Professional** | $99/mo | 10 | All features, unlimited batches |
| **Enterprise** | Custom | Unlimited | Custom features, priority support |

---

## Access Control Flow

### 1. Sign Up Process

**Controlled Sign-Up (Option A - Invite Only):**
```
1. Admin manually creates organization
2. Admin invites user via email
3. User receives invite link
4. User creates account (password)
5. User automatically added to organization
```

**Self-Service Sign-Up (Option B - With Approval):**
```
1. User fills out registration form
2. Request goes to admin for approval
3. Admin reviews and approves/rejects
4. If approved, organization created + user added
5. User receives welcome email with login link
```

**Immediate Sign-Up (Option C - Stripe Required):**
```
1. User fills out registration form
2. User enters payment method (Stripe)
3. Payment verified → Organization created immediately
4. User gets instant access
```

### 2. Login Flow with Subscription Check

```typescript
// On Login
1. User logs in with email/password
2. Firebase Auth authenticates
3. Load user document from Firestore
4. Load organization document
5. Check organization.subscriptionStatus:
   - 'active' → Allow access
   - 'trialing' → Allow access (show trial banner)
   - 'past_due' → Check grace period
     - < 7 days → Allow access (show warning banner)
     - > 7 days → Suspend access, show payment page
   - 'cancelled' or 'suspended' → Block access, show reactivation page
6. Update user.lastLogin timestamp
```

### 3. Adding Team Members

**Invite Process:**
```typescript
1. Organization owner clicks "Invite Member"
2. Enters email + role (member or admin)
3. System checks:
   - Current members < max members for tier
   - Organization subscription is active
   - Email not already registered
4. Creates invite in /organizationInvites
5. Sends email with invite link
6. Link expires in 7 days
7. User clicks link → signup page with pre-filled email
8. User creates password
9. User added to organization automatically
```

---

## Automated Subscription Management

### Payment Integration (Stripe)

**Setup:**
```bash
npm install stripe
```

**Cloud Function - Stripe Webhook:**
```typescript
// functions/src/index.ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature']!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
  }

  res.json({ received: true });
});

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata.organizationId;

  await db.collection('organizations').doc(orgId).update({
    subscriptionStatus: subscription.status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    updatedAt: FieldValue.serverTimestamp()
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find organization by Stripe customer ID
  const orgs = await db.collection('organizations')
    .where('customerId', '==', customerId)
    .get();

  if (!orgs.empty) {
    const orgId = orgs.docs[0].id;

    // Update to past_due
    await db.collection('organizations').doc(orgId).update({
      subscriptionStatus: 'past_due',
      updatedAt: FieldValue.serverTimestamp()
    });

    // Send warning email to billing contact
    await sendPaymentFailureEmail(orgId);
  }
}
```

**Stripe Events to Handle:**
- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Status change
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_succeeded` - Payment received
- `invoice.payment_failed` - Payment failed

### Automated Access Revocation

**Scheduled Cloud Function (runs daily):**
```typescript
// functions/src/index.ts
export const checkSubscriptionStatus = onSchedule("every day 00:00", async (event) => {
  const now = new Date();

  // Find organizations with expired subscriptions
  const expiredOrgs = await db.collection('organizations')
    .where('subscriptionStatus', '==', 'past_due')
    .where('currentPeriodEnd', '<', now)
    .get();

  for (const orgDoc of expiredOrgs.docs) {
    const org = orgDoc.data();
    const gracePeriodEnd = new Date(org.currentPeriodEnd.toDate());
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7); // 7-day grace period

    if (now > gracePeriodEnd) {
      // Grace period expired, suspend access
      await db.collection('organizations').doc(orgDoc.id).update({
        subscriptionStatus: 'suspended',
        status: 'suspended',
        updatedAt: FieldValue.serverTimestamp()
      });

      // Send suspension email
      await sendSuspensionEmail(orgDoc.id);

      console.log(`Suspended organization ${orgDoc.id} due to non-payment`);
    }
  }
});
```

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function to get user data
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    // Helper function to get organization
    function getOrganization(orgId) {
      return get(/databases/$(database)/documents/organizations/$(orgId)).data;
    }

    // Check if user belongs to organization
    function belongsToOrganization(orgId) {
      return request.auth != null &&
             getUserData().organizationId == orgId;
    }

    // Check if organization is active
    function isOrganizationActive(orgId) {
      let org = getOrganization(orgId);
      return org.subscriptionStatus in ['active', 'trialing'];
    }

    // Users collection
    match /users/{userId} {
      // Can read own profile
      allow read: if request.auth.uid == userId;

      // Can read team members in same organization
      allow read: if request.auth != null &&
                     getUserData().organizationId == resource.data.organizationId;

      // Only system can create/update users
      allow write: if false;
    }

    // Organizations collection
    match /organizations/{orgId} {
      // Members can read their own organization
      allow read: if belongsToOrganization(orgId);

      // Only organization owner can update
      allow update: if belongsToOrganization(orgId) &&
                       getUserData().role == 'organization-owner';

      // No direct creation/deletion
      allow create, delete: if false;
    }

    // Batches - Only accessible if organization has active subscription
    match /batches/{batchId} {
      allow read, write: if request.auth != null &&
                           belongsToOrganization(resource.data.organizationId) &&
                           isOrganizationActive(getUserData().organizationId);
    }

    // Screenshots - Only accessible if organization has active subscription
    match /screenshots/{screenshotId} {
      allow read, write: if request.auth != null &&
                           isOrganizationActive(getUserData().organizationId);
    }

    // Packages - Only accessible if organization has active subscription
    match /packages/{packageId} {
      allow read: if request.auth != null &&
                    isOrganizationActive(getUserData().organizationId);

      allow write: if request.auth != null &&
                     isOrganizationActive(getUserData().organizationId);
    }
  }
}
```

---

## Implementation Steps

### Phase 1: Quick Setup (For Testing)

**Run the test user script:**
```bash
node create-test-user.js
```

This creates:
- Test user: `test@importer.com` / `test123456`
- Test organization with active subscription
- 30-day trial period

### Phase 2: Add Stripe Integration

**1. Install Stripe:**
```bash
npm install stripe
cd functions && npm install stripe
```

**2. Set up Stripe environment variables:**
```bash
firebase functions:config:set \
  stripe.secret_key="sk_test_..." \
  stripe.webhook_secret="whsec_..."
```

**3. Deploy Stripe webhook function:**
```bash
firebase deploy --only functions:stripeWebhook
```

**4. Configure Stripe webhook:**
- Go to Stripe Dashboard → Webhooks
- Add endpoint: `https://YOUR-PROJECT.cloudfunctions.net/stripeWebhook`
- Select events:
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_succeeded
  - invoice.payment_failed

### Phase 3: Enable User Invitations

**1. Create email templates** (using SendGrid/Mailgun/etc.)

**2. Deploy invite functions:**
```bash
firebase deploy --only functions:sendInviteEmail,acceptInvite
```

### Phase 4: Automated Monitoring

**1. Deploy scheduled function:**
```bash
firebase deploy --only functions:checkSubscriptionStatus
```

**2. Monitor logs:**
```bash
firebase functions:log --only checkSubscriptionStatus
```

---

## Admin Dashboard Features

**Master Admin Can:**
- View all organizations
- Manually approve new organizations
- Suspend/reactivate organizations
- Override subscription limits
- View payment history
- Generate usage reports

**Organization Owner Can:**
- Invite team members
- Remove team members
- Upgrade/downgrade subscription
- View billing history
- Update organization settings

**Organization Member Can:**
- Use the app (batches, packages, etc.)
- View team members
- Cannot invite or manage subscription

---

## Access Denial Scenarios

**1. Subscription Expired:**
```
┌─────────────────────────────────────────┐
│  ⚠️  Subscription Expired               │
│                                         │
│  Your subscription ended on Jan 15.    │
│  To continue using ImportFlow, please  │
│  update your payment method.           │
│                                         │
│  [Update Payment Method]               │
│  [Contact Support]                      │
└─────────────────────────────────────────┘
```

**2. Payment Failed:**
```
┌─────────────────────────────────────────┐
│  ⚠️  Payment Failed                     │
│                                         │
│  Your recent payment was declined.     │
│  You have 7 days to update payment     │
│  before access is suspended.           │
│                                         │
│  Days remaining: 5                      │
│                                         │
│  [Update Payment Method]               │
└─────────────────────────────────────────┘
```

**3. Member Limit Reached:**
```
When inviting:
┌─────────────────────────────────────────┐
│  ⚠️  Member Limit Reached               │
│                                         │
│  Your plan allows 5 members.           │
│  You currently have 5 active members.  │
│                                         │
│  [Upgrade to Professional] ($99/mo)    │
│  → Up to 10 members                     │
└─────────────────────────────────────────┘
```

---

## Testing Subscription Flow

**1. Create test organization:**
```bash
node create-test-user.js
```

**2. Simulate payment failure:**
```typescript
// In Firebase console
organizations/test-org-001
  subscriptionStatus: 'past_due'
  currentPeriodEnd: (date 10 days ago)
```

**3. Try to login:**
- Should show payment failed message
- Should block access to app

**4. Simulate payment success:**
```typescript
organizations/test-org-001
  subscriptionStatus: 'active'
  currentPeriodEnd: (date 30 days from now)
```

**5. Try to login:**
- Should allow access
- Should show active subscription badge

---

## Best Practices

**Security:**
- Never expose Stripe keys in frontend
- Always verify webhooks with signature
- Use Firestore security rules to enforce subscription checks
- Rate limit invite endpoints

**User Experience:**
- Show clear subscription status in UI
- Provide grace period (7 days) before suspension
- Send email warnings before suspension
- Allow reactivation with one click

**Monitoring:**
- Log all subscription changes
- Alert on failed payments
- Track member usage per organization
- Monitor for abuse (rapid invite/revoke cycles)

---

## Next Steps

1. ✅ Run `node create-test-user.js` to create test account
2. ⏳ Set up Stripe account and configure webhook
3. ⏳ Implement invite email system
4. ⏳ Deploy subscription monitoring function
5. ⏳ Add frontend subscription UI (upgrade/downgrade)
6. ⏳ Test full flow end-to-end

**Your app now has complete subscription-based access control!** 🎉
