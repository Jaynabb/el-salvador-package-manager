# Google OAuth Architecture - ImportFlow

## Overview
This document explains how Google OAuth integration works in ImportFlow's multi-tenant organization system.

## Architecture Summary

### Google Connection is at the **ORGANIZATION** Level
- **ONE** Google account connection per organization
- All members of an organization share the same Google connection
- Google Docs/Sheets are created in the **organization owner's** Google Drive (or whoever connects the account)

## User Roles Explained

### 1. Master Admin
- **Role**: `master-admin`
- **Purpose**: Platform administrator (YOU - the service provider)
- **Capabilities**:
  - View ALL organizations and their data
  - Create organizations
  - Manage all users across all organizations
  - Monitor system-wide activity
  - **DOES NOT** upload screenshots or create orders
  - **DOES NOT** have own Google connection
  - Acts as oversight/support only

### 2. Organization Owner
- **Role**: `organization-owner`
- **Purpose**: Business owner (your customers who run import businesses)
- **Capabilities**:
  - Connect **organization's** Google account (Settings page)
  - Upload screenshots and create orders
  - Export orders to Google Docs (goes to org's Google Drive)
  - Invite team members
  - Manage organization settings
  - Full access to all organization data

### 3. Organization Member
- **Role**: `organization-member`
- **Purpose**: Employee/team member of an organization
- **Capabilities**:
  - Upload screenshots and create orders
  - Export orders to Google Docs (uses org's Google connection)
  - View organization data
  - **CANNOT** connect/disconnect Google account
  - **CANNOT** invite other members (only owner can)

## How Google OAuth Works

### Connection Flow

1. **Organization Owner** (or any member if you allow) goes to Settings
2. Clicks "Connect Google Account"
3. OAuth flow:
   - **Mobile**: Full-page redirect to Google (popups are blocked on mobile)
   - **Desktop**: Popup window with Google sign-in
4. User authorizes ImportFlow to:
   - Access Google Drive (create folders and files)
   - Create/edit Google Docs
   - Create/edit Google Sheets
5. Tokens saved to organization record in Firestore:
```typescript
Organization {
  googleConnected: true
  googleAccessToken: "encrypted_token"
  googleRefreshToken: "encrypted_refresh_token"
  googleTokenExpiry: Date
  googleEmail: "owner@business.com"
  googleDriveFolderId: "abc123xyz" // Auto-created "ImportFlow - Exported Orders" folder
}
```

### Export Flow

1. **Any member** of organization exports orders
2. System checks: `currentUser.organizationId` → get Organization doc
3. Verifies: `organization.googleConnected === true`
4. Uses: `organization.googleAccessToken` to create Google Doc
5. Google Doc is created in: Organization's Google Drive folder
6. All members see same Google Docs (shared organization Drive)

### Token Refresh
- Access tokens expire after 1 hour
- System automatically uses `googleRefreshToken` to get new access token
- Refresh tokens don't expire (until user revokes access)
- If refresh fails → user must reconnect Google account

## Data Flow Diagram

```
Master Admin (You)
  ↓ Creates
Organization A (Customer Business A)
  ├── Owner: owner@businessA.com
  │   └── Connects Google: googleDrive@businessA.com
  ├── Member 1: employee1@businessA.com
  └── Member 2: employee2@businessA.com
      ↓ All 3 users share Google connection
      ↓ All exports go to googleDrive@businessA.com
      └── Google Drive Folder: "ImportFlow - Exported Orders"

Organization B (Customer Business B)
  ├── Owner: owner@businessB.com
  │   └── Connects Google: owner@businessB.com
  └── Member 1: employee@businessB.com
      ↓ Both users share Google connection
      ↓ All exports go to owner@businessB.com
      └── Google Drive Folder: "ImportFlow - Exported Orders"
```

## Key Points

### ✅ Correct Understanding
1. Google connection is per-organization, NOT per-user
2. Organization owner connects their business Google account
3. All team members use that shared connection for exports
4. Each organization has separate Google Drive folder
5. Master admin NEVER uploads or exports (monitoring only)

### ❌ Common Misconceptions
1. ~~Each user has their own Google connection~~ → NO
2. ~~Members need to connect their personal Google~~ → NO
3. ~~Exports go to each member's Drive~~ → NO
4. ~~Master admin uploads screenshots~~ → NO

## Master Admin vs Organization Owner

| Feature | Master Admin | Organization Owner | Organization Member |
|---------|-------------|-------------------|-------------------|
| Create organizations | ✅ | ❌ | ❌ |
| View all orgs data | ✅ | ❌ (only own org) | ❌ (only own org) |
| Connect Google | ❌ | ✅ | ❌ |
| Upload screenshots | ❌ | ✅ | ✅ |
| Export to Google Docs | ❌ | ✅ | ✅ |
| Invite team members | ❌ | ✅ | ❌ |
| Manage billing | ❌ | ✅ | ❌ |

## Current Implementation Status

### ✅ Implemented
- Multi-tenant organization system
- Role-based access control (master-admin, organization-owner, organization-member)
- Google OAuth at organization level
- Token storage and refresh
- Mobile-friendly OAuth (redirect instead of popup)
- Order export to Google Docs using org's connection

### ⚠️ Needs Clarification
- Should organization members be able to connect/disconnect Google?
  - **Recommendation**: NO - only owner should manage integrations
- Should master admin see a combined dashboard of all activity?
  - **Recommendation**: YES - this is coming next

## Security Considerations

1. **Token Encryption**: Currently tokens are stored in Firestore
   - ⚠️ In production, should be encrypted at rest
   - Consider using Firebase Functions with Secret Manager

2. **OAuth Scopes**: Currently requesting:
   - `drive.file` - Create and manage files (minimal scope ✅)
   - `spreadsheets` - Create/edit sheets
   - `documents` - Create/edit docs
   - `userinfo.email` - Get user's email

3. **Token Revocation**: User can revoke access via:
   - Google Account Settings → Security → Third-party apps
   - ImportFlow Settings → "Disconnect Google Account"

## Next Steps

### Master Admin Dashboard Enhancements
1. Show aggregated statistics across all organizations
2. Activity feed: Recent uploads, exports, new users
3. Organization health: Which orgs are active, which are inactive
4. Google connection status for each org
5. Usage metrics for billing/support

### Recommended Changes
1. Remove upload/export capabilities from master admin view
2. Add comprehensive monitoring dashboard for master admin
3. Add audit logs for all actions
4. Implement proper token encryption
5. Add Google connection health checks

## Questions for You

1. **Should organization members be able to connect Google?**
   - Current: Only owner can connect
   - Alternative: Any member can connect (overwrites previous connection)
   - Recommendation: Owner only (more controlled)

2. **What should master admin dashboard show?**
   - Total organizations count?
   - Recent activity across all orgs?
   - Revenue/subscription status?
   - Support tickets?

3. **How should you retrieve customer documents?**
   - Master admin dashboard with search by customer name?
   - Direct Firestore access?
   - Admin panel showing all exported docs with download links?

Let me know your preferences and I'll implement accordingly!
