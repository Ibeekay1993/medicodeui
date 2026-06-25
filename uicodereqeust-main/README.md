# MedAuth (MedCode UI)

MedAuth streamlines clinical pre-authorizations, tariff matching, and claims processing. Built on a modern React, TypeScript, and Vite frontend, it integrates with Supabase DB for authorization rules, NHIA pricing structures, and clinician workflows.

## Features

- **Clinical Pre-Authorization & Review**: Clinician and nurse portals to submit, evaluate, and track medical authorizations.
- **Tariff & Drug Matching**: Integration with NHIA Medicine & Procedure Price Lists (2025) for automated or manual tariff verification.
- **Claims Portal & Analysis**: Dashboard to analyze claims distribution, request history, and HMO compliance.
- **WhatsApp Integration**: Automated notifications and support channel tracking.
- **Audit Logging**: Comprehensive system tracing for admin compliance.

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Radix UI
- **Routing & State**: React Router DOM, TanStack React Query
- **Data Integration**: Supabase client integration
- **Formatting & Export**: Excel (XLSX) parsers, custom PDF tools

## Setup and Installation

1. Install dependencies:
   ```bash
   bun install
   ```
2. Configure local environment (`.env` file):
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   ```
3. Run the development server:
   ```bash
   bun run dev
   ```
4. Build for production:
   ```bash
   bun run build
   ```
