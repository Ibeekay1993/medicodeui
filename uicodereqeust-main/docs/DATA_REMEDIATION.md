# Sensitive Data Repository Remediation

**Status: incomplete until GitHub visibility is restricted and the rewritten history is verified.** This document intentionally does not name beneficiaries or reproduce sensitive records.

## Scope

Static inspection confirmed that Git history contains bulk beneficiary imports, historical authorization data, phone-to-policy backfills, and individual record repairs. Some of these migrations have already been applied to production. The patient database itself is not changed by repository cleanup.

## Required handling

1. Restrict repository visibility and confirm Coolify still has authenticated read access before pushing a rewritten repository.
2. Remove sensitive row data from all Git history, including reachable tags and any other refs. A deletion in a new commit is not a history purge.
3. Preserve each already-applied migration version in the current tree as a sanitized, comment-only migration using the same 14-digit version prefix. Do not remove migration version files wholesale or alter production migration tracking.
4. Keep future data imports in an access-controlled process outside the public repository. Do not commit beneficiary exports, authorization histories, patient-specific SQL, or lists of sensitive paths.
5. Review every historical and current file for credentials separately. Rotate only credentials confirmed to have been exposed; repository cleanup does not rotate keys.
6. Rewrite the repository on `main` only. Do not create backup branches. Coordinate the rewritten history with Coolify and require other local clones to reclone or reset to the new `main`.

## Verification required before closing this item

- GitHub reports the repository as private and `main` is the only branch.
- The latest Coolify deployment can fetch `main` and reports the rewritten commit.
- A scan of every reachable commit and tag finds no patient data or exposed credentials.
- The sanitized migration filenames still reconcile with the production migration-version ledger.
- Production beneficiary and authorization data remain present and unchanged.

Rewriting public Git history cannot guarantee removal of copies already cloned, cached, or forked. Treat those copies as potentially retained and follow the organization's incident-response process.
