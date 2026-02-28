# Publishing SpeakScribe to the Chrome Web Store

This guide walks you through setting up automated publishing from GitHub to the Chrome Web Store.

## Prerequisites

1. A [Chrome Web Store Developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time registration fee)
2. Your extension uploaded manually at least once (to get an Extension ID)
3. A Google Cloud project with the Chrome Web Store API enabled

## Step 1: Register as a Chrome Web Store Developer

Go to https://chrome.google.com/webstore/devconsole and pay the $5 registration fee.

## Step 2: Upload Your Extension Manually (First Time Only)

1. Zip the extension files (everything except `.git`, `.github`, and markdown files)
2. Go to the Developer Dashboard, click "New Item"
3. Upload the zip file
4. Fill in the listing details: description, screenshots, category, etc.
5. Submit for review
6. Copy your **Extension ID** from the dashboard URL or listing page

## Step 3: Create Google API Credentials

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one)
3. Enable the **Chrome Web Store API**:
   - Go to APIs and Services > Library
   - Search for "Chrome Web Store API"
   - Click Enable
4. Create OAuth 2.0 credentials:
   - Go to APIs and Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Desktop app" (or "Web application")
   - Note down the **Client ID** and **Client Secret**
5. Get a Refresh Token:
   - Install the CLI locally: `npm install -g chrome-webstore-upload-cli@3`
   - Follow the [official token guide](https://github.com/nicedoc/chrome-webstore-upload-cli#get-a-refresh-token) or use:
     ```
     npx chrome-webstore-upload-cli@3 init
     ```
   - This opens a browser for OAuth consent; authorize and copy the **Refresh Token**

## Step 4: Add GitHub Secrets

Go to your repo: https://github.com/caelicode/speakscribe/settings/secrets/actions

Add these four secrets:

| Secret Name            | Value                                  |
|------------------------|----------------------------------------|
| `CHROME_EXTENSION_ID`  | Your extension ID from the dashboard   |
| `CHROME_CLIENT_ID`     | Google OAuth2 Client ID                |
| `CHROME_CLIENT_SECRET` | Google OAuth2 Client Secret            |
| `CHROME_REFRESH_TOKEN` | Google OAuth2 Refresh Token            |

## Step 5: Publish

### Automatic (recommended)

Tag a release and push it:

```bash
# Update version in manifest.json first, then:
git add manifest.json
git commit -m "Bump version to 2.1.0"
git tag v2.1.0
git push origin main --tags
```

The GitHub Action triggers automatically on `v*` tags.

### Manual

1. Go to Actions tab in your GitHub repo
2. Select "Publish to Chrome Web Store"
3. Click "Run workflow"
4. Optionally set "dry_run" to true to upload without publishing (for testing)

## Troubleshooting

### Refresh token expired

Google refresh tokens expire if unused for 6 months. Re-run `npx chrome-webstore-upload-cli@3 init` to get a new one and update the GitHub secret.

### Upload succeeds but publish fails

Your extension may be pending review. Check the Developer Dashboard for status. Common reasons: new permissions require re-review, policy violations flagged, or listing information is incomplete.

### "Item not found" error

Double-check that `CHROME_EXTENSION_ID` matches your extension's ID in the Developer Dashboard. The ID is the long string in the URL when viewing your extension.
