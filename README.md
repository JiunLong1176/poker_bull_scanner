# Poker Bull Scanner PWA Setup Guide

## How to Get Your Google Cloud Vision API Key

To make the scanner work with real playing cards, you need a Google Cloud Vision API Key. Follow these steps:

### Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Sign in with your Google account.
3. Click on the project dropdown at the top of the page and select **"New Project"**.
4. Give your project a name (e.g., "Poker Bull Scanner") and click **Create**.

### Step 2: Enable the Cloud Vision API
1. In the sidebar, go to **"APIs & Services" > "Library"**.
2. Search for **"Cloud Vision API"**.
3. Click on **Cloud Vision API** and then click the **Enable** button.
4. *Note: You may need to set up a billing account if you haven't already. Google Cloud offers a free tier (usually first 1,000 units/month are free).*

### Step 3: Create an API Key
1. Go to **"APIs & Services" > "Credentials"**.
2. Click **"+ CREATE CREDENTIALS"** at the top and select **"API key"**.
3. Your new API Key will be displayed. Copy this string.

### Step 4: Secure Your Key (Important!)
Since this app runs in the browser, your key is visible in the code. To prevent others from using your quota:
1. Click **"Edit API key"** (or click the pencil icon next to your key).
2. Under **"API restrictions"**, select **"Restrict key"**.
3. Click the dropdown and check **"Cloud Vision API"**. Click **OK**.
4. Under **"Application restrictions"**, select **"Websites"**.
5. Add the URL where you will host your app (e.g., `https://your-username.github.io/*` or `https://your-project.vercel.app/*`).
6. Click **Save**.

### Step 5: Add Key to Code
1. Open `app.js` in your project folder.
2. Find the line:
   ```javascript
   const API_KEY = 'YOUR_GOOGLE_CLOUD_VISION_API_KEY';
   ```
3. Replace `'YOUR_GOOGLE_CLOUD_VISION_API_KEY'` with the key you copied in Step 3.
4. Save the file.

## How to Deploy
1. Upload all project files (`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, images) to a hosting provider.
   - **GitHub Pages**: Create a repo, upload files, go to Settings > Pages, and select the `main` branch.
   - **Vercel/Netlify**: Drag and drop the folder into their dashboard.
2. The site must be served over **HTTPS** for the camera to work.
