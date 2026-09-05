# WhatsApp Cloud API Webhook — Deployment Guide

This document covers the production wiring for the `whatsapp-webhook` and `whatsapp-worker`
Supabase Edge Functions that back `medicodeui.web.app` (`MedAuth NG`).

> **Why Supabase Edge Functions, not Firebase Hosting?**
> `medicodeui.web.app` is an SPA — Firebase Hosting cannot serve dynamic webhook traffic.
> The webhook URL we register with Meta must therefore be a real HTTPS endpoint.
> Supabase Edge Functions give us:
> - Global HTTPS URL on the Supabase project subdomain
> - Service-role DB access (no JWT required for webhook)
> - No Redis / no paid middleware (free tier compatible)
> - Native `fetch` for outbound HTTP to Gemini and Meta
>
> **PHI stance:** only the patient's free-text is sent to Gemini (classification only).
> No internal IDs, codes, or auth rows are forwarded to Gemini or to WhatsApp.

---

## 1. Supabase secrets to set

Run once per environment:

```bash
# Verification handshake (Meta → us)
supabase secrets set WHATSAPP_VERIFY_TOKEN=<random-32-char-string>

# Outbound Meta Cloud API
supabase secrets set META_APP_SECRET=<your-meta-app-secret>
supabase secrets set META_ACCESS_TOKEN=<permanent-system-user-token>
supabase secrets set META_PHONE_NUMBER_ID=<your-phone-number-id>
supabase secrets set META_GRAPH_VERSION=v20.0

# Outbound Google AI Studio (primary AI provider)
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>
supabase secrets set GEMINI_MODEL=gemini-2.5-flash

# AI provider failover (fallback 1): Groq (OpenAI-compatible)
supabase secrets set GROQ_API_KEY=<your-groq-api-key>
supabase secrets set GROQ_MODEL=<groq-model-id>   # e.g. llama-3.3-70b-versatile

# AI provider failover (fallback 2): Modal-hosted model (optional HTTP endpoint)
# Only set MODAL_ENDPOINT if you have a Modal HTTP inference endpoint deployed.
# The worker POSTs {"text","context"} and expects an AnalysisResult JSON (or
# {"analysis": {...}}) back. MODAL_WEBHOOK_SECRET is sent in the
# "x-modal-webhook-secret" header if configured.
# supabase secrets set MODAL_ENDPOINT=https://<you>.modal.run/
# supabase secrets set MODAL_WEBHOOK_SECRET=<shared-secret>

# Per-provider hard timeouts (ms). Default 10000; the worker never lets an AI
# request hang indefinitely.
# supabase secrets set GEMINI_TIMEOUT_MS=10000
# supabase secrets set GROQ_TIMEOUT_MS=10000
# supabase secrets set MODAL_TIMEOUT_MS=10000

# Outbound internal MedAuth API
supabase secrets set MEDAUTH_INTERNAL_BASE_URL=https://medicodeui.web.app
supabase secrets set MEDAUTH_INTERNAL_API_KEY=<the X-Api-Key your /api/authorizations expects>

# Template defaults
supabase secrets set WHATSAPP_TEMPLATE_AUTH_RECEIVED=auth_received
supabase secrets set WHATSAPP_TEMPLATE_LANG=en

# Optional worker hardening
supabase secrets set WHATSAPP_WORKER_SECRET=<random-32-char-string>
supabase secrets set WHATSAPP_MAX_ATTEMPTS=5
supabase secrets set WHATSAPP_WORKER_BATCH=10
```

Apply the migrations:

```bash
supabase db push
```

Deploy the two new functions (they will be added automatically; the `whatsapp-webhook`
already existed and has been replaced with the production version):

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-worker --no-verify-jwt
```

After deploy your webhook URL is:

```
https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
```

Find `<project-ref>` in `supabase/.temp/*/project.json` or in the Supabase dashboard URL.

---

## 2. Meta (Facebook) onboarding — Production checklist

The app is currently unpublished. To receive production traffic you must complete
**App Review** and, if your business is not yet verified, **Business Verification**.

### Step 1 — Add the Webhook product
1. https://developers.facebook.com/apps → your app → **Add Product** → **Webhook** (under WhatsApp).
2. The product entry should already exist because you're at the Configuration page.

### Step 2 — Configure the Webhook Callback
In **WhatsApp → Configuration → Webhooks**:
- **Callback URL:** `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`
- **Verify token:** paste the same value you set in `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and Save**.

The function responds to the verification GET handshake by echoing back the
`hub.challenge` when `hub.verify_token` matches. Meta will only mark the field as "Verified" if it gets `200` and the correct body.

### Step 3 — Subscribe the webhook to `messages`
In the **Webhook fields** section:
- ✅ `messages` — required (inbound text + status updates)
- You do **not** need `message_template_status_update` for this flow

Click **Subscribe** under the phone number row.

### Step 4 — Business Verification (only required for production + sending to non-test numbers)
If your display name is already "Approved" you can skip this; otherwise:
1. https://business.facebook.com/settings → **Security Center** → **Start Business Verification**.
2. Upload one of: CAC certificate (Nigeria), utility bill, articles of incorporation, or a tax document.
3. Add a verified business email + website URL.
4. Average review time: 1–3 business days. You'll receive an email from Meta.
5. Once verified, your business gets a green check; your WhatsApp display name moves to "Approved".

### Step 5 — App Review (advanced_permissions: `whatsapp_business_management`, `whatsapp_business_messaging`)
> In production with a **system user** permanent access token (which you already have),
> App Review is only required if you embed login or extra Graph features. Pure messaging
> with a system-user token does not require App Review. If the dashboard still asks you
> to publish, choose **"I'm using this app for my own business"** and select your verified
> business.

### Step 6 — Move app to Live
- Settings → Basic → **App Mode → Live** (toggle on).
- Make sure the **Business** dropdown points to your verified business.
- Hit **Switch Mode**.

---

## 3. Create and get the `auth_received` template approved

Templates are required because WhatsApp enforces the 24-hour customer-service window
and you may only send a pre-approved template outside that window.

### Create the template
1. https://business.facebook.com/wa/manage/message-templates/
2. **Create Template**:
   - **Name:** `auth_received` (lowercase, underscore — this is the value you set in `WHATSAPP_TEMPLATE_AUTH_RECEIVED`)
   - **Category:** `Transactional` (or `Alert Update`)
   - **Language:** `English (en)` or `en_US`
   - **Header:** none (or "MedAuth NG")
   - **Body:**
     ```
     Hello, your medical authorization request has been received.
     Ticket: {{1}}
     Procedure: {{2}}
     We will review and get back to you shortly.
     — MedAuth NG
     ```
   - **Buttons:** none
   - **Sample values:**
     - `{{1}}` = `A8F2C1`
     - `{{2}}` = `MRI scan`

3. Submit. **Approval typically takes minutes-to-hours** for Utility/Transactional
   categories (Meta sometimes asks to see the website privacy policy — link
   `https://medicodeui.web.app/privacy`).

> If Meta initially rejects the template for "marketing-like language", remove "Hello,"
> and any emoji and resubmit as **Alert Update**.

### Test send the template from dashboard
Use the **Send Message** box under the template row to send `auth_received` to your own
phone. Confirm the parameters render correctly before relying on the worker.

---

## 4. End-to-end smoke test

### A. Webhook handshake (no Meta needed)
```bash
curl -i "https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=12345"
# expect: HTTP 200, body "12345"
```

### B. Webhook signature path (use Meta's test webhook)
In Meta dashboard → **Webhooks → Test** → choose a phone number → paste a sample payload:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<phone_number_id>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "<phone_number_id>" },
        "messages": [{
          "from": "2348012345678",
          "id": "wamid.TEST123",
          "timestamp": "1700000000",
          "type": "text",
          "text": { "body": "Patient P-001 needs MRI at Lagos Island Maternity, urgent" }
        }]
      }
    }]
  }]
}
```
Click **Send Test Request**. The dashboard will show a green tick only if your endpoint
returns 200. Check function logs in Supabase → Edge Functions → whatsapp-webhook for the
`whatsapp-webhook: verified` and "queued" lines.

### C. Real send from your phone
1. Save your own WhatsApp number as a recipient of your test phone number.
2. Send the test text above to the test number.
3. Within ~5 seconds the patient should receive the `auth_received` template.
4. Inspect the row in `public.whatsapp_messages` — `status='completed'`,
   `extracted` populated, `internal_request_id` populated.

### D. Failure-injection tests
- Set `GEMINI_API_KEY` to an invalid value → worker retries with exponential backoff
  (visible in `next_attempt_at` advancing 30s → 1m → 2m → 4m → 8m), then marks `failed`
  after `WHATSAPP_MAX_ATTEMPTS`.
- Set `META_ACCESS_TOKEN` invalid → worker fails on `template_send` only;
  the row should retry and eventually mark `failed`.

### E. Verify queue health
```sql
select status, count(*) from public.whatsapp_messages group by 1 order by 1;
select * from public.whatsapp_processing_log order by created_at desc limit 30;
```

---

## 5. Security notes

- **Signature verification** is on by default; if `META_APP_SECRET` is missing the
  function refuses all POSTs with 401.
- **PHI minimization:** Gemini prompt contains only the patient's free-text and a
  classification schema. We do not send policy numbers, NHIA codes, or any field
  from `authorization_requests`.
- **Idempotency:** deduplicated by `whatsapp_messages.message_id` (Meta wamid is
  globally unique). Duplicate inserts silently no-op via the `unique` constraint.
- **Replay window:** the `attempts` column + `next_attempt_at` provide at-least-once
  semantics with bounded retries; the worker is safe to run in parallel thanks to the
  single-row claim pattern.
- **Internal API key** travels via `X-Api-Key` header only; never logged.
- **No console.log of full bodies** — only structured `{stage, message_id, status, ...}`
  events are emitted.

---

## 6. Cost / free-tier budget

- **Meta:** 1,000 service conversations/month free. One inbound message opens a 24-hour
  window; sending `auth_received` inside it costs 0 additional conversations.
- **Gemini 2.5 Flash:** 1500 RPD free, 4 RPM. Worker is single-flight and processes one
  row per webhook fan-out, with the cron as a backstop. You will hit Meta's free tier
  before Gemini's.
- **Supabase:** free plan supports 500K Edge Function invocations/month and 500MB DB.
  The queue + log table will fit well within that.

---

## 7. Internal `/api/authorizations` endpoint

The worker now POSTs to a `submit-authorization` Supabase Edge Function. By default
the worker calls `https://<project-ref>.supabase.co/functions/v1/submit-authorization`
(no external hop), authenticated with `X-Api-Key: $MEDAUTH_INTERNAL_API_KEY`.

If you later stand up a real HTTP server at `medicodeui.web.app/api/authorizations`,
override these two env vars on the worker:

```
MEDAUTH_INTERNAL_BASE_URL=https://medicodeui.web.app
MEDAUTH_INTERNAL_PATH=/api/authorizations
```

`submit-authorization` (source: `supabase/functions/submit-authorization/index.ts`):

- Validates `X-Api-Key` (or `X-Worker-Secret`).
- Idempotent on `whatsapp_message_id` — duplicate wamid returns the original
  `id` and `request_id` with `deduplicated: true`.
- Writes a `public.authorization_requests` row via service role (bypasses the
  hospital RLS policy) with `source='whatsapp'` and `status='pending'`.
- Cross-links the new `id` back into `whatsapp_messages.internal_request_id`
  so you can grep one row from the other.
- Returns `{ id, request_id, status }`.

Deploy it:

```bash
supabase functions deploy submit-authorization --no-verify-jwt
```

Test:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/submit-authorization" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $MEDAUTH_INTERNAL_API_KEY" \
  -d '{
    "phone_number": "2348012345678",
    "patient_name": "Test Patient",
    "provider_name": "Lagos Island Maternity",
    "procedure_type": "MRI scan",
    "urgency_level": 4,
    "missing_info": ["policy_number"],
    "whatsapp_message_id": "wamid.TEST-CURL-001"
  }'
# expect: HTTP 201, body {"id":"...","request_id":"REQ-YYYYMMDD-NNN","status":"pending"}
```

The function synthesises `patient_name` and `policy_number` when missing so
`authorization_requests`'s `NOT NULL` columns are always satisfied. It never
calls Gemini or Meta — all extraction happens upstream in the worker.