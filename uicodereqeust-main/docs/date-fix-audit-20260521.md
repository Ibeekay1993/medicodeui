# Focused date fix: 03/10/2025 → March 10, 2025

Applied migration: `20260521230000_fix_march10_2025_dates.sql`

**33 authorization codes** where Excel `Date` = `03/10/2025` but the app showed `19/05/2026` (or `2025-10-03`).

Correct `created_at`: **2025-03-10** (displays as **10/03/2025** in en-GB).

Example: **R/AO/011043150** — CHRISTIANA OWOYE, policy 2173446.
