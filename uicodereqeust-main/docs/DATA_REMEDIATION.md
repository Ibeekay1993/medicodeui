# Patient Data Remediation & Privacy Plan (NDPA Compliance)
**Ronsberger HMO Enterprise Portal**

This document establishes the official remediation procedure for patient data and infrastructure secrets committed to repository history, in compliance with the **Nigeria Data Protection Act (NDPA)** and healthcare privacy standards.

---

## 1. INVENTORY OF HISTORICAL PATIENT DATA FILES

The following files tracked in the repository contain historical beneficiary records, phone numbers, policy numbers, or patient names:

| File Path | Approximate Size | Data Contained | Production Status |
| :--- | :--- | :--- | :--- |
| `supabase/migrations/20260517234500_import_may_2026_nhis_beneficiaries.sql` | 7.7 MB | Names, DOBs, gender, policy numbers | Applied to DB |
| `supabase/migrations/20260401120000_seed_preauthorization_2025_workbook.sql` | 5.2 MB | 2025 pre-authorizations, clinical diagnoses | Applied to DB |
| `supabase/migrations/20261017103000_seed_july_2026_reconciled_historical_authorisations.sql` | 700 KB | July 2026 reconciled authorizations | Applied to DB |
| `supabase/migrations/20260331111000_backfill_phones_from_20260330_chat_log.sql` | 18 KB | Phone numbers paired with policy numbers | Applied to DB |
| `supabase/migrations/20260425180000_restore_adewole_oluwaseun_011007938bd.sql` | 2 KB | Patient-specific restoration record | Applied to DB |
| `scripts/seed_july_2026_reconciled_historical_authorisations.sql` | 700 KB | Duplicate script copy of historical seed | Offline script |

> [!WARNING]
> Because these database migrations have **already been executed** against the live production Supabase instance, deleting them from the current repository commit would desynchronize the `supabase_migrations.schema_migrations` tracking table on future migration runs. They must be managed through private repository isolation followed by a coordinated git-history squash/purge.

---

## 2. IMMEDIATE ACTIONS: GITHUB REPO PRIVACY & COOLIFY

The repository must be switched to **Private** immediately.

### How to make the repository private without breaking Coolify:
1. **In GitHub**:
   - Go to `https://github.com/Ibeekay1993/medicodeui/settings`
   - Scroll down to the **Danger Zone**
   - Click **Change repository visibility** -> Select **Make private**
2. **In Coolify**:
   - If Coolify is connected to GitHub via the **GitHub App Integration**, Coolify will continue to pull private repositories seamlessly with zero changes needed.
   - If Coolify was configured with public HTTPS cloning:
     1. In Coolify, open the Application Settings for the frontend.
     2. Under **Source**, select your GitHub App or add a **Deploy Key**.
     3. Copy the SSH Public Key provided by Coolify.
     4. In GitHub (`Settings -> Deploy Keys -> Add deploy key`), paste the public key with read-only access.
     5. Test deployment in Coolify to verify successful authentication.

---

## 3. GIT HISTORY PURGE INSTRUCTIONS (`git-filter-repo`)

To completely scrub historical patient data from the Git commit tree (so it cannot be retrieved even via commit hashes), the repository owner should execute the following steps on an isolated local machine.

### Step-by-Step History Scrubbing:

```bash
# 1. Install git-filter-repo (Python required)
pip install git-filter-repo

# 2. Clone a fresh, bare mirror of the repository
git clone --bare https://github.com/Ibeekay1993/medicodeui.git medicodeui-cleanup.git
cd medicodeui-cleanup.git

# 3. Create a list of paths to completely eliminate from all commits
cat << 'EOF' > /tmp/paths-to-remove.txt
uicodereqeust-main/supabase/migrations/20260517234500_import_may_2026_nhis_beneficiaries.sql
uicodereqeust-main/supabase/migrations/20260401120000_seed_preauthorization_2025_workbook.sql
uicodereqeust-main/supabase/migrations/20261017103000_seed_july_2026_reconciled_historical_authorisations.sql
uicodereqeust-main/supabase/migrations/20260331111000_backfill_phones_from_20260330_chat_log.sql
uicodereqeust-main/supabase/migrations/20260425180000_restore_adewole_oluwaseun_011007938bd.sql
uicodereqeust-main/scripts/seed_july_2026_reconciled_historical_authorisations.sql
EOF

# 4. Filter the repository history
git-filter-repo --paths-from-file /tmp/paths-to-remove.txt --invert-paths

# 5. Scrub any committed IP addresses or credentials from remaining commits
git-filter-repo --replace-text <(echo "2.24.58.189==>HOSTINGER_VPS_IP")

# 6. Re-add the remote and force-push clean main
git remote add origin git@github.com:Ibeekay1993/medicodeui.git
git push origin --force --all
git push origin --force --tags
```

---

## 4. CREDENTIAL ROTATION CHECKLIST

Because the repository was previously public, the following production credentials should be systematically rotated:

- [ ] **Hostinger VPS Root Password & SSH Keys**:
  - Update root password in Hostinger VPS control panel.
  - Disable password authentication in `/etc/ssh/sshd_config` (`PasswordAuthentication no`).
  - Use SSH key authentication only.
- [ ] **Self-Hosted Supabase Service Role Key & Anon Key**:
  - Update `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` in `/data/coolify/services/rufiptlacf2ik0phgii71ekq/.env`.
  - Restart the Supabase container stack.
- [ ] **Brevo (Sendinblue) Transactional API Key**:
  - In Brevo Console (`SMTP & API`), generate a new API key.
  - Revoke the previous key.
  - Update `BREVO_API_KEY` in Edge Functions environment.
- [ ] **Evolution API Key & Webhook Token**:
  - Rotate `EVOLUTION_API_KEY` and `EVOLUTION_WEBHOOK_TOKEN` on AWS ECS and Supabase.
- [ ] **Web Push VAPID Keys**:
  - Generate new VAPID keys (`npx web-push generate-vapid-keys`).
  - Update `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

---

## 5. CLIENT STORAGE HYGIENE (IMPLEMENTED)

To guarantee that no patient names, phone numbers, or clinical search strings linger on shared devices or hospital computers:
- `clearPatientAndSessionData()` in `src/lib/sessionState.ts` is triggered automatically upon:
  - User sign-out (`signOut`)
  - Inactivity timeout (`signOutForInactivity`)
  - Session expiration
- It permanently flushes:
  - `sessionStorage`: `req_search`, `claim_audit_*`, `ronsberger_whatsapp_*`, user profile roles
  - `localStorage`: draft import files, authorization drafts
