# Noroya Vercel CLI Deployment Guide

This guide provides step-by-step instructions to deploy the Noroya VTU & Marketplace application directly to Vercel using the **Vercel CLI** without needing GitHub integration.

---

## Prerequisites
- Node.js (v18 or higher) installed on your computer.
- A Vercel account ([vercel.com](https://vercel.com)).

---

## Option 1: Direct Local Deployment via Vercel CLI

### Step 1: Install Vercel CLI Globally
Open your terminal (macOS/Linux) or Command Prompt / PowerShell (Windows) and run:
```bash
npm install -g vercel
```
*Verify installation:*
```bash
vercel --version
```

### Step 2: Log In to Your Vercel Account
```bash
vercel login
```
- Select your preferred login method (Email, GitHub, GitLab, Bitbucket).
- If your GitHub account is currently unavailable, select **Continue with Email** and follow the email confirmation link.

### Step 3: Run First Deployment (Preview Build)
Navigate to your project root folder:
```bash
cd /path/to/Noroya
```
Run the deployment command:
```bash
vercel
```
You will be prompted with a series of setup questions:
1. **Set up and deploy?** -> Press `Y` (Yes)
2. **Which scope do you want to deploy to?** -> Select your personal account or team
3. **Link to existing project?** -> 
   - Choose `N` (No) if creating a new Vercel project, OR
   - Choose `Y` (Yes) and enter the name of your existing project (e.g. `noroya` or `noroyavtu`)
4. **What's your project's name?** -> Press Enter to accept default or type your project name
5. **In which directory is your code located?** -> `./` (Press Enter)
6. **Want to modify build settings?** -> Press `N` (No, `vercel.json` already defines build and output settings)

### Step 4: Deploy Directly to Production
Once you have tested the preview deployment or configured environment variables:
```bash
vercel --prod
```

---

## Option 2: Add Environment Variables via Terminal (Vercel CLI)

Instead of using the web dashboard, you can add and manage environment variables directly from your terminal.

### 1. Adding an Environment Variable
To add a variable interactively:
```bash
vercel env add <VARIABLE_NAME>
```
Example:
```bash
vercel env add SUPABASE_URL
```
The CLI will ask:
- **What's the value of SUPABASE_URL?** -> Paste the value
- **Add to which environments?** -> Use arrow keys and spacebar to select:
  - `Production`
  - `Preview`
  - `Development`
  (Press Enter to confirm)

### 2. Fast Non-Interactive Environment Variable Addition
You can pipe values directly without interactive prompts:
```bash
# Add to Production
echo "https://sdbfuuxdquzvtcwryimh.supabase.co" | vercel env add SUPABASE_URL production

# Add to Preview
echo "https://sdbfuuxdquzvtcwryimh.supabase.co" | vercel env add SUPABASE_URL preview

# Add to Development
echo "https://sdbfuuxdquzvtcwryimh.supabase.co" | vercel env add SUPABASE_URL development
```

### 3. Key Variables Required for Noroya

Run these commands for your project:
```bash
# Supabase Configuration
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY

# Payment Gateways
vercel env add FLUTTERWAVE_PUBLIC_KEY
vercel env add FLUTTERWAVE_SECRET_KEY
vercel env add FLW_SECRET_HASH
vercel env add PAYSTACK_PUBLIC_KEY
vercel env add PAYSTACK_SECRET_KEY

# VTU Providers
vercel env add BIGISUB_API_KEY
vercel env add BIGISUB_BASE_URL
vercel env add NIFEX_API_KEY
vercel env add NIFEX_BASE_URL

# Application Secrets
vercel env add JWT_SECRET
vercel env add APP_URL
```

### 4. Pull Environment Variables to Local `.env`
To download all configured environment variables into a local `.env.local` file for testing:
```bash
vercel env pull .env.local
```

### 5. List and Remove Environment Variables
- List all variables:
  ```bash
  vercel env ls
  ```
- Remove a variable:
  ```bash
  vercel env rm <VARIABLE_NAME>
  ```

---

## Option 3: Full Project Setup & Production Deployment Walkthrough

Here is the complete end-to-end command sequence for linking an existing project, setting environment variables, and pushing a production release:

```bash
# 1. Open project directory
cd Noroya

# 2. Link your local directory to your existing Vercel project
vercel link

# 3. Pull current remote environment variables (optional verification)
vercel env pull .env.production.local

# 4. Verify local build works properly before deploying
npm run build

# 5. Deploy to Production with automatic build & asset bundling
vercel --prod
```

### Inspecting Production Logs
To view live deployment logs from your terminal:
```bash
vercel logs --prod
```

---

## Project-Specific Build Notes
- Build command configured: `npm run build` (`vite build && node scripts/build-function.mjs`)
- Output directory: `dist`
- Backend API entry: `api/index.js` (handled via Serverless Function rewrite in `vercel.json`)
- If your local build succeeds with `npm run build`, Vercel CLI will upload and execute the exact same build on Vercel infrastructure.
