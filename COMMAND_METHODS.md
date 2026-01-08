# ImportFlow Command Methods - Quick Reference

This guide explains the different ways clients can export batches and interact with ImportFlow.

---

## 🚀 Quick Comparison

| Method | Requirements | Best For | Setup Time |
|--------|-------------|----------|------------|
| **SMS Commands** | Any phone number | Universal access, personal numbers | 30 minutes |
| **WhatsApp Commands** | WhatsApp Business API | WhatsApp-first businesses | 1-2 hours |
| **Web Dashboard** | ImportFlow account | Manual control, staff operations | Already available |
| **Email Commands** | Email address | Professional documentation | 1 hour |

---

## 📱 SMS Commands (Recommended)

**Works with ANY phone number - personal or business!**

### Advantages
✅ No WhatsApp Business account required
✅ Works with personal WhatsApp numbers
✅ Works with regular phones (no smartphone needed)
✅ Universal carrier support
✅ Very affordable (~$1-5/month)
✅ Same commands as WhatsApp

### How It Works
1. Client sends SMS to your Twilio number: `/export batch-1`
2. System processes command and generates documents
3. Links sent back via SMS automatically
4. Client downloads and submits to customs

### Setup
See [SMS_SETUP.md](./SMS_SETUP.md) for complete instructions.

**Cost:** ~$1/month + $0.0075 per SMS (very cheap)

---

## 💬 WhatsApp Commands

**Requires WhatsApp Business API**

### Advantages
✅ Native WhatsApp integration
✅ Rich media support
✅ Brand presence in WhatsApp
✅ Professional business profile

### Disadvantages
❌ Requires WhatsApp Business account
❌ More complex setup
❌ Not available for personal numbers

### How It Works
Same as SMS, but through WhatsApp Business API.

### Setup
See [WHATSAPP_COMMANDS.md](./WHATSAPP_COMMANDS.md) for complete instructions.

---

## 💻 Web Dashboard (Manual)

**Already built into ImportFlow**

### Advantages
✅ No setup required
✅ Full control and visibility
✅ Staff can process manually
✅ No external dependencies

### How It Works
1. Staff logs into ImportFlow dashboard
2. Navigate to Batch Manager
3. Select batch and click "Export"
4. Download or email documents to client

**Best for:** Staff operations, backup method

---

## 📧 Email Commands (Future)

**Send commands via email**

### How It Would Work
1. Client emails: `export batch-1` to exports@importflow.com
2. System processes and generates documents
3. Documents sent back via email automatically

**Status:** Not yet implemented (but easy to add)

---

## 🎯 Recommended Setup

### For Most Businesses
**Use SMS Commands** - It's universal, affordable, and works with any phone number.

1. Set up Twilio SMS webhook (see [SMS_SETUP.md](./SMS_SETUP.md))
2. Give clients your SMS number
3. Clients send commands from ANY phone
4. Done!

### For WhatsApp-First Businesses
If you already have WhatsApp Business API:

1. Set up WhatsApp webhook (see [WHATSAPP_COMMANDS.md](./WHATSAPP_COMMANDS.md))
2. Also set up SMS as fallback for clients without WhatsApp Business
3. Support both channels

### For Small Operations
Just use the **Web Dashboard** manually:

1. Clients WhatsApp/call to request export
2. Staff processes in dashboard
3. Staff sends documents via email/WhatsApp
4. No automation needed

---

## 📋 Command Syntax (Universal)

**These commands work the same across all methods:**

### Export Batch
```
/export batch-1
```
Generates documents and sends back automatically.

### Export to Email
```
/export batch-1 email:user@example.com
```
Sends documents to specified email instead.

### Check Status
```
/status batch-1
```
Get current batch status and details.

### Get Help
```
/help
```
Show available commands.

---

## 🔐 Security & Access Control

All automated methods verify batch access:

- **Phone-based:** Batches linked to sender's phone number
- **Organization-based:** Users can only access their organization's batches
- **Role-based:** Admins have full access

### Access Verification

When a client sends `/export batch-1`, the system checks:
1. Does batch-1 exist?
2. Does the sender have access to it?
3. Is the batch ready for export?

If any check fails, access is denied with appropriate error message.

---

## 💰 Cost Comparison

### SMS (Twilio)
- **Setup:** Free
- **Monthly:** $1 for phone number
- **Per command:** $0.0075 (less than 1 cent)
- **100 commands/month:** ~$1.75 total
- **500 commands/month:** ~$4.75 total

### WhatsApp Business API
- **Setup:** Free (but requires approval)
- **Monthly:** $0 (Facebook/Meta)
- **Per message:** $0.005-0.02 (varies by country)
- **More expensive than SMS in most cases**

### Web Dashboard
- **Setup:** Free (already built)
- **Monthly:** $0
- **Staff time:** Variable
- **Best for low volume**

---

## 🚀 Getting Started

### 1. Choose Your Method

- **Universal access?** → Use SMS
- **WhatsApp-first?** → Use WhatsApp + SMS fallback
- **Small operation?** → Use Web Dashboard

### 2. Follow Setup Guide

- SMS: [SMS_SETUP.md](./SMS_SETUP.md)
- WhatsApp: [WHATSAPP_COMMANDS.md](./WHATSAPP_COMMANDS.md)
- Web: Already available in app

### 3. Test It

Send a test command:
```
/help
```

You should get back the command list.

### 4. Go Live

Give your clients the command instructions!

---

## 📖 Client Instructions

### For SMS Users

```
📱 HOW TO EXPORT YOUR BATCH

1. Send SMS to: +1 (503) 555-9876
2. Type: /export batch-1
   (Replace "batch-1" with your batch ID)
3. Receive document links via SMS
4. Download and submit to customs!

💡 Works from ANY phone!
```

### For WhatsApp Users

```
💬 HOW TO EXPORT YOUR BATCH

1. WhatsApp: +1 (503) 555-9876
2. Type: /export batch-1
3. Receive document links
4. Download and submit to customs!
```

---

## 🆘 Support

### For Setup Help
- SMS Issues: See [SMS_SETUP.md](./SMS_SETUP.md) troubleshooting section
- WhatsApp Issues: See [WHATSAPP_COMMANDS.md](./WHATSAPP_COMMANDS.md) troubleshooting
- Web Dashboard: Contact ImportFlow support

### For Command Help
Send `/help` to your ImportFlow number to see available commands.

---

## 🎓 Best Practices

1. **Set up SMS first** - It's the universal solution
2. **Add WhatsApp if you have it** - But don't rely on it exclusively
3. **Keep Web Dashboard available** - Always have a manual fallback
4. **Link batches to phone numbers** - Automatic access control
5. **Test regularly** - Ensure webhooks are working
6. **Monitor costs** - SMS is cheap but monitor usage
7. **Provide clear instructions** - Clients need to know the commands

---

**Need more help?** Contact ImportFlow support or check the detailed setup guides:
- [SMS_SETUP.md](./SMS_SETUP.md) - Complete SMS setup guide
- [WHATSAPP_COMMANDS.md](./WHATSAPP_COMMANDS.md) - WhatsApp Business API setup
- [README.md](./README.md) - Main ImportFlow documentation
