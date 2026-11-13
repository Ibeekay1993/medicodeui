# Ronsberger HMO Enterprise Portal

The **Ronsberger HMO Enterprise Portal** is a production healthcare management platform that streamlines clinical pre-authorizations, tariff matching, referrals, and claims processing for hospitals, clinicians, and administrators under Ronsberger Nigeria Limited.

Built on React 18, TypeScript, TailwindCSS, and a self-hosted Supabase backend on Hostinger VPS (Coolify).

## Architecture & Production Domains

- **Frontend Portal**: [https://app.ronsbergerhmo.io](https://app.ronsbergerhmo.io)
- **Backend API**: [https://api.ronsbergerhmo.io](https://api.ronsbergerhmo.io)
- **Hosting**: Dedicated Hostinger VPS managed via Coolify.
- **WhatsApp Gateway**: Evolution API deployed on AWS ECS.

For full AI agent and contributor guidelines, see [AI_INSTRUCTIONS.md](../AI_INSTRUCTIONS.md).

## Key Capabilities

- **Clinical Pre-Authorization & Review**: Hospital staff and nurse portals to submit, evaluate, and track medical authorizations with automated code generation.
- **NHIA Tariff & Medicine Matching**: Integration with NHIA Medicine & Procedure Price Lists (2025) for automated or manual tariff verification.
- **Claims Management & Audit**: Centralized claims ledger with historical reconciliation, NHIS tariff validation, and dispute workflows.
- **WhatsApp Integration**: Patient notifications, arrival OTP validation, and hospital support channel tracking via Evolution API.
- **7-Day Invitation Validity**: Account setup and invitation links valid for 7 days.

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Environment configuration:
   Copy `.env.production.example` to `.env` and configure the self-hosted endpoint and publishable key:
   ```env
   VITE_SUPABASE_URL=https://api.ronsbergerhmo.io
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   VITE_VAPID_PUBLIC_KEY=your_web_push_vapid_public_key
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Verify TypeScript and test suite:
   ```bash
   npx tsc --noEmit
   npm test -- --run
   ```

5. Build for production:
   ```bash
   npm run build
   ```
