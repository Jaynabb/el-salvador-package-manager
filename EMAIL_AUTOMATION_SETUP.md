# Email Automation Setup Guide

Currently, the system shows you the credentials in a nice modal that you can copy and email manually. If you want to **automate** sending emails, here are your options:

---

## Current System (✅ Deployed)

### **What Happens Now:**

1. You create an organization in Master Admin panel
2. A beautiful modal pops up with:
   - Email address
   - Temporary password
   - App URL
   - **"Copy Email Template" button** - copies a pre-formatted email
3. You paste the email template into Gmail/Outlook
4. Send it to the organization owner

### **Advantages:**
- ✅ No setup required - works immediately
- ✅ No additional costs
- ✅ Full control over when emails are sent
- ✅ Can customize message before sending
- ✅ Works with any email provider (Gmail, Outlook, etc.)

---

## Option 1: Firebase Trigger Email Extension (Recommended)

### **What This Does:**
Automatically sends emails when organizations are created

### **Setup Steps:**

1. **Install the Extension**
   ```bash
   firebase ext:install firestore-send-email
   ```

2. **Choose Email Provider:**
   - SendGrid (recommended, 100 free emails/day)
   - Mailgun
   - SMTP (Gmail, Outlook, etc.)

3. **Configuration:**
   - Collection path: `mail`
   - From email: `noreply@importflow.com` (or your domain)

4. **Update Code** (in `AdminPanelNew.tsx`):
   ```typescript
   // After creating organization, add email to queue
   await addDoc(collection(db, 'mail'), {
     to: orgForm.contactEmail,
     message: {
       subject: 'Your ImportFlow Account is Ready',
       html: `
         <h2>Hi ${orgForm.contactName},</h2>
         <p>Your organization "${orgForm.organizationName}" has been set up!</p>
         <h3>Login Details:</h3>
         <ul>
           <li><strong>URL:</strong> https://importflow-app.web.app</li>
           <li><strong>Email:</strong> ${orgForm.contactEmail}</li>
           <li><strong>Password:</strong> ${orgForm.ownerPassword}</li>
         </ul>
         <p><em>You'll be required to change your password on first login.</em></p>
       `
     }
   });
   ```

### **Costs:**
- SendGrid: 100 emails/day FREE, then $19.95/month
- Mailgun: 5,000 emails/month FREE for 3 months
- Gmail SMTP: FREE but limited

### **Pros:**
- ✅ Fully automated
- ✅ Professional emails
- ✅ Free tier available
- ✅ Easy to set up

### **Cons:**
- ⚠️ Requires email service account
- ⚠️ Takes ~5 minutes to set up
- ⚠️ Costs money after free tier

---

## Option 2: Custom Cloud Function

### **What This Does:**
Write your own email sending logic

### **Setup:**

1. **Create Function** (in `functions/index.ts`):
   ```typescript
   import * as functions from 'firebase-functions';
   import * as nodemailer from 'nodemailer';

   export const sendWelcomeEmail = functions.firestore
     .document('organizations/{orgId}')
     .onCreate(async (snap, context) => {
       const org = snap.data();

       // Configure email transport (Gmail, SendGrid, etc.)
       const transporter = nodemailer.createTransport({
         service: 'gmail',
         auth: {
           user: 'your-email@gmail.com',
           pass: 'app-specific-password'
         }
       });

       await transporter.sendMail({
         to: org.contactEmail,
         subject: 'Your ImportFlow Account is Ready',
         html: `...email template...`
       });
     });
   ```

2. **Deploy:**
   ```bash
   firebase deploy --only functions
   ```

### **Pros:**
- ✅ Full control
- ✅ Can customize everything
- ✅ No third-party dependencies

### **Cons:**
- ⚠️ Requires coding
- ⚠️ Need to manage email credentials
- ⚠️ More complex to maintain

---

## Option 3: Resend (Modern Alternative)

### **What This Does:**
Modern email API - super simple to use

### **Setup:**

1. **Sign up:** https://resend.com (3,000 emails/month FREE)

2. **Install:**
   ```bash
   npm install resend
   ```

3. **Add to Cloud Function:**
   ```typescript
   import { Resend } from 'resend';
   const resend = new Resend('your-api-key');

   await resend.emails.send({
     from: 'ImportFlow <onboarding@importflow.com>',
     to: orgForm.contactEmail,
     subject: 'Your ImportFlow Account is Ready',
     html: `...template...`
   });
   ```

### **Pros:**
- ✅ Super simple API
- ✅ Great free tier (3,000/month)
- ✅ Beautiful deliverability
- ✅ No credit card for free tier

### **Cons:**
- ⚠️ Requires custom domain for production
- ⚠️ Need to verify domain

---

## Recommendation

### **For Now (Current System):**
Keep using the manual copy-paste system. It works great and gives you control.

### **If You Want Automation:**
Use **Resend** - it's the easiest:

1. Sign up at https://resend.com (free)
2. Get API key
3. Add this code after creating organization:

```typescript
// At top of file
import { Resend } from 'resend';
const resend = new Resend(import.meta.env.VITE_RESEND_API_KEY);

// After organization creation
await resend.emails.send({
  from: 'ImportFlow <noreply@importflow.com>',
  to: newOrgCredentials.email,
  subject: 'Your ImportFlow Account is Ready',
  html: `
    <h2>Hi ${newOrgCredentials.ownerName},</h2>
    <p>Your organization "${newOrgCredentials.organizationName}" has been set up in ImportFlow!</p>

    <h3>Login Details:</h3>
    <ul>
      <li><strong>URL:</strong> https://importflow-app.web.app</li>
      <li><strong>Email:</strong> ${newOrgCredentials.email}</li>
      <li><strong>Temporary Password:</strong> ${newOrgCredentials.password}</li>
    </ul>

    <p><em>⚠️ You'll be required to change your password on first login.</em></p>

    <h3>Next Steps:</h3>
    <ol>
      <li>Log in and change your password</li>
      <li>Connect Google Drive in Settings (for exports)</li>
      <li>Add team members in Organization tab</li>
      <li>Start uploading and managing orders!</li>
    </ol>
  `
});
```

---

## What's Best for You?

| Scenario | Recommended Solution |
|----------|---------------------|
| Just starting, few organizations | **Current system** (manual copy-paste) |
| Creating 5-10 orgs/month | **Current system** (still manageable) |
| Creating 10+ orgs/month | **Resend** (automated) |
| Need custom branding | **Resend** or **SendGrid** |
| Free tier only | **Current system** or **Resend** (3000/mo free) |

---

Let me know if you want help setting up any of these options!
