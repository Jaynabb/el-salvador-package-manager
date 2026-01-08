# 📤 Bulk Screenshot Upload Guide

## Overview

The Bulk Upload feature allows you to upload multiple screenshots at once (e.g., 20 screenshots from 5 different customers) and intelligently group them by customer name before processing.

## How It Works

### 1. **Upload Screenshots**

You can upload screenshots from two sources:

- **📁 Local Computer**: Select multiple image files from your computer
- **📂 Google Drive**: Select images directly from your Google Drive (requires Google API setup)

### 2. **Assign Customer Names**

After uploading, you'll see all screenshots in a grid. You have three options for assigning customer names:

#### Option A: Manual Assignment
- Type the customer name directly into the input field under each screenshot
- Use the "Quick assign" dropdown to select from existing customer names

#### Option B: AI Auto-Assignment
- Click "🤖 Auto-Assign with AI" button
- The AI will analyze each screenshot and extract the customer name automatically
- Review and adjust any names that need correction

#### Option C: Hybrid Approach
- Let AI auto-assign most names
- Manually fix any that are incorrect or unclear
- Use quick assign for screenshots you know belong to existing customers

### 3. **Review and Process**

- All screenshots must have a customer name assigned (green border = assigned, yellow border = needs assignment)
- The "Process All" button shows progress: `✅ Process All (15/20)`
- Once all are assigned, click "Process All"

### 4. **Results**

After processing:
- Screenshots are grouped by customer name
- AI extracts order data from each screenshot
- All inquiries appear in the "App Inquiries" tab
- From there, assign them to docs as usual

## Features

### Smart Customer Grouping

The system automatically groups screenshots by customer name:
- If you upload 3 screenshots for "Maria Rodriguez" and 2 for "Carlos Mendez", they'll be grouped accordingly
- Each customer group can be assigned to a different doc

### AI Extraction Respects Manual Names

When you manually assign a customer name, the AI will:
- Extract order details (items, prices, tracking, etc.)
- Use YOUR assigned customer name instead of the AI-detected one
- This ensures accuracy even if the screenshot has ambiguous or missing customer info

### Google Drive Integration

To enable Google Drive uploads, add to your `.env` file:

```env
VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your_api_key
VITE_GOOGLE_APP_ID=your_project_number
```

Get these from [Google Cloud Console](https://console.cloud.google.com):
1. Create or select a project
2. Enable Google Drive API and Google Picker API
3. Create OAuth 2.0 credentials
4. Copy the Client ID, API Key, and Project Number

## Example Workflow

### Scenario: 20 screenshots from 5 customers

1. **Upload**: Click "Bulk Upload" tab → Upload 20 screenshots
2. **Auto-Assign**: Click "Auto-Assign with AI" → AI processes all 20
3. **Review**: Check assignments:
   - Customer A: 5 screenshots ✓
   - Customer B: 4 screenshots ✓
   - Customer C: 6 screenshots ✓
   - Customer D: 3 screenshots ✓
   - Customer E: 2 screenshots ✗ (AI missed - manually enter name)
4. **Fix**: Manually assign customer name to the 2 missing screenshots
5. **Process**: Click "Process All (20/20)"
6. **Result**: 5 customer groups created in App Inquiries
7. **Assign**: Go to "App Inquiries" → Assign each group to their respective docs

## Tips

- **Upload in batches**: If you have 100+ screenshots, upload 20-30 at a time for better performance
- **Consistent naming**: Use the same customer name format (e.g., "Maria Rodriguez" not "Rodriguez, Maria")
- **Quick assign**: The dropdown shows existing customer names from your docs - use it for faster assignment
- **Preview**: Hover over screenshots to see full-size preview before assigning

## Troubleshooting

### Google Drive not working
- Check that all API keys are in your `.env` file
- Ensure Google Drive API and Picker API are enabled in Google Cloud Console
- Make sure you've authorized the app in Google OAuth consent screen

### AI auto-assign fails
- Some screenshots may not have clear customer names visible
- Manually assign these after auto-assign completes
- Consider adding customer name to future screenshots in a consistent location

### Screenshots not processing
- Ensure all have customer names assigned (no yellow borders)
- Check browser console for errors
- Verify Gemini API key is valid in `.env`

## Best Practices

1. **Clear screenshots**: Ensure order details and customer names are visible
2. **Consistent uploads**: Upload all screenshots for a customer at once
3. **Review before processing**: Double-check AI assignments before clicking "Process All"
4. **Use existing names**: When possible, use the quick assign dropdown to maintain consistency
5. **Batch processing**: Upload and process in manageable batches (20-30 screenshots)

---

**Need help?** Check the main dashboard for AI assistant or contact support.
