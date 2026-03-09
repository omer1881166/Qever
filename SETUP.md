# Supabase Setup Guide

Complete instructions for setting up Supabase Storage for your Live Event Gallery.

---

## Step 1: Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Select your organization (or create one)
4. Enter project details:
   - **Name**: Wedding Gallery (or your event name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Select the closest to your event location
5. Click **"Create new project"** and wait for setup (~2 minutes)

---

## Step 2: Create a Storage Bucket

1. In your project dashboard, click **"Storage"** in the left sidebar
2. Click **"New bucket"**
3. Configure the bucket:
   - **Name**: `event-photos`
   - **Public bucket**: ✅ **Enable this** (so guests can view without login)
   - **File size limit**: 50MB (or your preference)
   - **Allowed MIME types**: `image/*`
4. Click **"Create bucket"**

---

## Step 3: Configure Storage Policies

1. In Storage, click on your `event-photos` bucket
2. Click the **"Policies"** tab
3. Click **"New Policy"** → **"For full customization"**

### Policy 1: Public Read Access (for guests)
```sql
-- Policy name: Allow public read access
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-photos');
```

Click **"Review"** → **"Save policy"**

### Policy 2: Authenticated Upload (for photographer)
Click **"New Policy"** → **"For full customization"**
```sql
-- Policy name: Allow authenticated uploads
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-photos' 
  AND auth.role() = 'authenticated'
);
```

Click **"Review"** → **"Save policy"**

---

## Step 4: Get Your API Keys

1. Click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"** under Configuration
3. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbG...` (the long key under "Project API keys")

---

## Step 5: Add Configuration to Your App

1. Open `app.js` in your project
2. Replace the placeholder configuration (lines 9-10):

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## Step 6: Professional Database Setup

1. In Supabase, go to **"SQL Editor"**.
2. Paste the contents of `setup.sql` and click **"Run"**.
3. Go to **"Table Editor"** → **"halls"** and add your first hall:
   - `name`: "Grand Ballroom"
   - `slug`: "hall-1"
   - `owner_id`: (Choose your user ID from the Auth section)

---

## Step 7: Manager Dashboard

1. Open **`admin.html`** in your browser.
2. Log in with your Supabase email and password.
3. You can now:
   - **Start an Event**: Enter the wedding name and when it should end.
   - **Manage Photos**: View current uploads.
   - **Purge Old Photos**: Delete storage files when done.

---

## Step 8: Multi-Hall URLs

Give each hall a unique permanent QR code using these URLs:
- **Hall 1**: `https://your-app.com/?hall=hall-1`
- **Hall 2**: `https://your-app.com/?hall=hall-2`

The app will automatically detect if there is an active wedding in that hall and show the correct photos.

---

## Step 9: Deployment

1. Use **Vercel** or **Netlify** for free hosting.
2. Connect your GitHub (or drag and drop the folder).
3. Ensure all files (`admin.html`, `auth.js`, `dashboard.js`, etc.) are included.

---

## Quick Reference

| Configuration | Value |
|---------------|-------|
| Bucket name | `event-photos` |
| Public access | ✅ Enabled |
| Upload access | Authenticated users only |

---

## Troubleshooting

### Photos not loading?
- Verify bucket is set to **Public**
- Check that SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Look at browser console for errors

### Upload failing?
- Ensure the photographer is logged in
- Check file size is under the limit
- Verify MIME type is `image/*`

### CORS errors?
- Supabase handles CORS automatically for public buckets
- If issues persist, check your bucket's public setting

---

## Need Help?

- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase Discord](https://discord.supabase.com/)
