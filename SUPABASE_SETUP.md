# Supabase Setup Guide for Noroya VTU Billing App

This guide explains how to properly migrate and configure your Supabase backend to match the React client's requirements.

---

## 🛠️ Step 1: Run the Database Migration

To resolve the profile loading bugs and fully synchronize user profiles server-side, you must run the single idempotent SQL migration once via your Supabase project's SQL Editor.

1. Go to your **[Supabase Dashboard](https://supabase.com/)**.
2. Select your Noroya project.
3. Open **SQL Editor** from the left-hand navigation sidebar.
4. Click **New Query**.
5. Open `/app/noroya_project/supabase_migration.sql` in your local workspace, copy its entire contents, and paste it into the editor.
6. Click **Run** (or press `Cmd + Enter` / `Ctrl + Enter`).

---

## 🔒 Step 2: What This Migration Configures

The migration executes the following tasks under the hood:
1. **Creates a Single Consolidated `profiles` Table**: Consolidates balance, full name, usernames, transaction pins, and referral codes into a single authoritative profiles database.
2. **Backward-Compatibility View (`users`)**: Maps any queries pointing to `users` automatically to `profiles` under the hood to completely eliminate race conditions and data synchronization drift!
3. **Enables Row Level Security (RLS)**: Secures all profile data so users can only read and write to their own data rows.
4. **Protects Balance and Roles**: Adds a custom database-level validation trigger (`prevent_privileged_field_update`) which guarantees that users cannot update their own roles or inject fake wallet balances via malicious client modifications.
5. **Secure Referral Lookups**: Creates a security-definer function `get_referral_owner(code)` so the app can verify active referrals without exposing users' private data or table scans to the public.
6. **Server-Side Atomic Signups (`handle_new_user`)**: Hooks into the Supabase authentication engine. As soon as a user signs up (via email/password or Google OAuth), a corresponding profile containing metadata (full name, phone number, pin, referral owner resolution) is created server-side instantaneously.

---

## 🔑 Step 3: Configure Authentication Providers

To ensure Google OAuth and seamless sign-in work out of the box, configure the following settings in your dashboard:

### Google OAuth Integration
1. In the Supabase Dashboard, go to **Authentication > Providers > Google**.
2. Toggle Google Auth **ON**.
3. Retrieve your **Client ID** and **Client Secret** from the [Google Cloud Console](https://console.cloud.google.com/).
4. Insert them into the provider details.
5. Add the provided **Authorized Redirect URI** from Supabase to your Google credentials redirect whitelist.

### Email Confirmation Behavior
Depending on your desired user onboarding friction, go to **Authentication > Providers > Email**:
- **Email Confirmation Enabled (Default)**: Users will receive a confirmation email. They cannot sign in or access their profiles until they click the email confirmation link.
- **Email Confirmation Disabled (Simplified Setup)**: To bypass confirmation and let users log in immediately after signing up, turn off the **Confirm Email** toggle in the Email provider settings.
