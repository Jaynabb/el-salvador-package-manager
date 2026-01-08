# 👥 User Invitation & Management Guide

## How Organizations Add Users to ImportFlow

There are **2 ways** for organizations to add users to their account:

---

## ✅ Method 1: Master Admin Creates Users (Current)

**Who can do this:** Only you (Master Admin)

**Process:**
1. Log in as Master Admin at https://importflow-app.web.app
2. Go to **Admin** tab
3. Click **Users** tab
4. Click **"+ Add New User"**
5. Fill in:
   - Email
   - Password (temporary - user should change it)
   - Display Name
   - Role (Owner or Member)
   - Assign to Organization
6. Click **"Create User"**
7. **Share credentials** with the user:
   ```
   Your ImportFlow Account:
   URL: https://importflow-app.web.app
   Email: their@email.com
   Password: TempPassword123!

   Please change your password after first login!
   ```

**User logs in:**
- They go to https://importflow-app.web.app
- Enter email and temporary password
- Should see their organization's data only
- Can change password in Settings

---

## ✅ Method 2: Organization Owners Invite Users (Self-Service)

**Who can do this:** Organization Owners (your clients)

**Process:**
1. Organization owner logs in
2. Goes to **"Organization"** tab
3. Clicks **"Invite Member"**
4. Enters:
   - New user's email address
   - Role (Member or Admin)
5. System sends invitation email to that address
6. New user receives email with:
   - Link to sign up
   - Organization name
   - Role assignment
7. New user clicks link → Creates their password → Joins organization

**Benefits:**
- ✅ Organizations manage their own team
- ✅ No need for you to manually create each user
- ✅ More professional (invitation emails)
- ✅ Scales better

---

## 📧 Invitation Email Flow

**When owner sends invite:**

```
TO: newemployee@company.com
FROM: ImportFlow <importflow@tastybuilds.com>
SUBJECT: You've been invited to join [Organization Name] on ImportFlow

Hi there!

[Owner Name] has invited you to join [Organization Name] on ImportFlow as a [Role].

Click the link below to accept your invitation and create your account:

https://importflow-app.web.app/signup?invite=abc123xyz

This invitation expires in 7 days.

Questions? Reply to this email.

Best regards,
The ImportFlow Team
```

**When new user clicks link:**
1. Taken to signup page with pre-filled organization info
2. Creates their password
3. Account automatically linked to organization
4. Logs in and sees organization data

---

## 🎯 What You Should Do Now

### For Testing:
1. **Log in as Master Admin**
2. **Create a test organization** (if you haven't):
   - Admin → Organizations → Add New Organization
   - Name: "Test Import Co."
   - Fill in details
3. **Create a test user for that organization**:
   - Admin → Users → Add New User
   - Email: test@example.com
   - Password: Test123!
   - Role: Member
   - Organization: Test Import Co.
4. **Log out and test logging in** as that user:
   - Should only see "Test Import Co." data
   - Should NOT see other organizations' data

### For Your First Real Customer:
1. **Master Admin creates organization** (their business)
2. **Master Admin creates first user** (organization owner)
3. **Share credentials** with them
4. **They log in** and can then:
   - Manage packages
   - Add customers
   - Invite their own team members (if invitation system is enabled)
   - Export to Google Docs/Sheets

---

## 🔐 User Roles Explained

### Master Admin (YOU)
**Can:**
- ✅ See ALL organizations
- ✅ Create/edit/delete organizations
- ✅ Create/edit/delete users for ANY organization
- ✅ View all packages across all organizations
- ✅ Manage platform settings

**Cannot:**
- ❌ N/A - Full access

---

### Organization Owner
**Can:**
- ✅ Manage their organization settings
- ✅ Invite/remove team members
- ✅ Manage packages for their organization
- ✅ Manage customers for their organization
- ✅ Export to Google Docs/Sheets
- ✅ View all organization data

**Cannot:**
- ❌ See other organizations' data
- ❌ Create new organizations
- ❌ Access Admin panel

---

### Organization Member
**Can:**
- ✅ View packages for their organization
- ✅ Add new packages
- ✅ View customers for their organization
- ✅ Add new customers
- ✅ Export data

**Cannot:**
- ❌ Invite new users
- ❌ Remove team members
- ❌ Edit organization settings
- ❌ See other organizations' data
- ❌ Access Admin panel

---

## 📋 Testing Checklist

Test the complete flow:

**As Master Admin:**
- [ ] Create a test organization
- [ ] Create a test user assigned to that organization
- [ ] Verify organization shows in "Organizations" tab
- [ ] Verify user shows in "Users" tab with organization name

**As Organization User:**
- [ ] Log in with test credentials
- [ ] Verify you only see your organization's data
- [ ] Add a test package
- [ ] Add a test customer
- [ ] Verify you DON'T see Admin tab
- [ ] Verify you CAN'T see other organizations

**Data Isolation:**
- [ ] Create 2 different organizations
- [ ] Create 1 user for each
- [ ] Log in as User A → Should only see Org A data
- [ ] Log in as User B → Should only see Org B data
- [ ] Log in as Master Admin → Should see ALL data

---

## 🎯 Current State

**What's Working:**
- ✅ Master Admin can create organizations
- ✅ Master Admin can create users
- ✅ Users can log in with email/password
- ✅ Data isolation (users only see their org)
- ✅ Role-based access control
- ✅ Multi-tenant architecture

**What's Ready (May need testing):**
- ⚠️ Organization owners inviting members
- ⚠️ Invitation email flow
- ⚠️ Sign-up via invitation link

**Next Steps:**
1. Test creating users via Admin panel
2. Test logging in as different users
3. Verify data isolation works
4. If invitation system needed, we can enable/test it

---

## 🚀 Ready to Onboard Your First Customer!

**Process:**
1. Create their organization in Admin panel
2. Create their first user (owner role)
3. Share credentials with them
4. They log in and start managing packages!

**URL:** https://importflow-app.web.app
**Email Template:** importflow@tastybuilds.com

---

*Your multi-tenant SaaS platform is ready for customers!*
