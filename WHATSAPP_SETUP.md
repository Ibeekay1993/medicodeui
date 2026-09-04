# WhatsApp Business API Integration Guide

## Architecture Overview

```
Patient WhatsApp Message
       │
       ▼
Meta Cloud API Webhook
       │
       ▼
Firebase Cloud Function (medicodeui.web.app/webhook/whatsapp)
   - Verifies Meta signature (X-Hub-Signature-256)
   - Stores message in Supabase whatsapp_messages table (queue)
   - Returns HTTP 200 within 20s
       │
       ▼
Supabase Edge Function (whatsapp-worker) — triggered by cron/ping
   - Polls whatsapp_messages for status='received'
   - Calls Gemini 2.0 Flash for structured data extraction
   - Creates authorization_request ticket in Supabase
   - Sends "auth_received" template reply via Meta Cloud API
   - Updates message status to 'processed' or 'failed'
```

## Step 1: Environment Variables

### Firebase Functions (Webhook)
Set these in the Firebase Console > Functions > Environment variables:

| Variable | Description |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Any secret string — use `medauth_verify_2026` |
| `META_APP_SECRET` | From Meta Developers app dashboard |
| `SUPABASE_URL` | `https://optistuvyeiojlgmkdks.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase Dashboard > Project Settings > API keys |

Or via CLI:
```bash
firebase functions:config:set \
  whatsapp.verify_token="medauth_verify_2026" \
  whatsapp.app_secret="$META_APP_SECRET" \
  supabase.url="https://optistuvyeiojlgmkdks.supabase.co" \
  supabase.service_role_key="$SUPABASE_SERVICE_ROLE_KEY"
```

### Supabase Edge Functions (Worker)
Set these in Supabase Dashboard > Project Settings > Edge Functions > Environment Variables:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `META_ACCESS_TOKEN` | Permanent system user access token from Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | The phone number ID from Meta |
| `SUPABASE_URL` | Auto-set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase |

## Step 2: Deploy Infrastructure

### Deploy the webhook function
```bash
cd uicodereqeust-main
npm install -g firebase-tools
firebase login
cd functions
npm install
cd ..
npm run deploy:firebase
```

### Deploy the Supabase migration + worker
```bash
npx supabase db push
npx supabase functions deploy whatsapp-worker
```

### Set up worker polling
Since Firebase Spark plan doesn't support scheduled functions, use a free ping service
(e.g., [cron-job.org](https://cron-job.org) or [uptime-monkey](https://uptime-monkey.com)) to call the worker endpoint every 30 seconds:

```
GET https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker
Headers: Authorization: Bearer <anon-key>
```

## Step 3: Meta Developers Setup

### 3a. Create / Configure the App
1. Go to [Meta for Developers](https://developers.facebook.com)
2. Select your app (or create one with "Business" type)
3. Add the **WhatsApp** product to your app
4. In WhatsApp > Getting Started:
   - Link your **WhatsApp Business Account**
   - Select your **phone number** (already registered and verified per your status)

### 3b. Configure Webhooks
1. Go to **WhatsApp > Configuration > Webhooks**
2. Set:
   - **Callback URL**: `https://medicodeui.web.app/webhook/whatsapp`
   - **Verify Token**: `medauth_verify_2026`
3. Subscribe to fields:
   - `messages` (incoming messages)
   - `message_status` (sent, delivered, read)
   - `message_template_status` (template approvals)
4. Click **Verify** — you should see "Webhook verified"

### 3c. Generate Access Token
1. Go to **Tools > Access Token Tool**
2. Or create a **System User** with `business_management` and `whatsapp_business_messaging` permissions
3. Generate a **permanent access token**
4. Store the token value in `META_ACCESS_TOKEN`

## Step 4: Meta Business Verification

Your app is currently **unpublished**. To receive production data from any WhatsApp user (not just admins/developers/testers):

1. Go to [Meta Business Suite](https://business.facebook.com)
2. Select your Business Manager
3. Go to **Business Settings > Business Info**
4. Complete **Business Verification**:
   - Confirm your business email
   - Verify your business address (mail/postcard confirmation)
   - Provide business documents if requested
5. Go to **App Dashboard > App Review > Permissions and Features**
6. Submit for review:
   - `whatsapp_business_messaging` (required for sending/receiving)
   - `business_management` (for business account operations)
7. Once approved, go to **WhatsApp > Configuration > Webhooks**
8. Ensure the webhook is **subscribed** to your phone number

> **Important**: You must complete Business Verification AND App Review. Until then, only app admins, developers, and testers will receive webhook events.

## Step 5: Create the "auth_received" Message Template

1. Go to **Meta Business Suite > Messaging > Templates**
2. Click **Create Template**
3. Select **WhatsApp** as the channel
4. Fill in:
   - **Template name**: `auth_received` (must be lowercase, no spaces)
   - **Language**: English (en)
   - **Category**: UTILITY
   - **Type**: Standard (text-based)
5. Template content:
   ```
   Hello {{1}},

   Your medical authorization request has been received by Ronsberger HMO.

   Our team is reviewing your request and will send you an update with your arrival PIN once approved.

   Thank you.
   ```
6. Submit for approval (usually takes 1-3 business days)
7. Once approved, the template will be available for use in webhook replies

> **Note**: Template names are case-sensitive and must be submitted in lowercase. The template must be approved before you can send it to non-contacts.

## Step 6: End-to-End Testing

### 6a. Verify webhook reachability
```bash
# Replace YOUR_VERIFY_TOKEN with the actual token
curl -X GET \
  "https://medicodeui.web.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=medauth_verify_2026&hub.challenge=test_challenge_123"
# Should return: test_challenge_123
```

### 6b. Simulate a webhook payload
```bash
curl -X POST \
  https://medicodeui.web.app/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$(echo -n '{"entry":[]}' | openssl dgst -sha256 -hmac YOUR_APP_SECRET)" \
  -d '{"object":"whatsapp_business_account","entry":[{"id":"PHONE_NUMBER_ID","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15551234567","phone_number_id":"PHONE_NUMBER_ID"},"messages":[{"from":"2348012345678","id":"test_msg_001","timestamp":"1234567890","text":{"body":"Name: John Doe, Policy: 12345678, Diagnosis: Malaria, Treatment: Artemether","type":"text"},"type":"text"}]}}}]}'
```

### 6c. Check the queue
```sql
-- Run in Supabase SQL editor
SELECT * FROM whatsapp_messages ORDER BY received_at DESC LIMIT 10;
```

### 6d. Run the worker manually
```bash
curl -X GET \
  https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker \
  -H "Authorization: Bearer <anon-key>"
```

### 6e. Send a real test message
Send a WhatsApp message from your registered test number to the business account phone number, e.g.:
```
Name: Jane Smith
Policy: 87654321
Diagnosis: Diabetes mellitus
Treatment: Insulin injection
Urgency: 3
```

Then check:
1. The worker processes it within 30 seconds
2. A new row appears in `authorization_requests` with `source = 'whatsapp'`
3. The patient receives the "auth_received" template reply

## Step 7: Monitoring

### Check webhook delivery in Meta
- Go to **WhatsApp > Troubleshooting > Webhooks** in the Meta App Dashboard
- This shows delivery success/failure rates and retry attempts

### Check worker logs
```bash
npx supabase functions logs whatsapp-worker
```

### Check Firebase Function logs
```bash
firebase functions:log --limit 50
```

### Monitor the message table
```sql
SELECT status, COUNT(*) FROM whatsapp_messages GROUP BY status;
SELECT * FROM whatsapp_messages WHERE status = 'failed' AND error_message IS NOT NULL ORDER BY processed_at DESC LIMIT 10;
```

## Troubleshooting

### Webhook verification fails
- Ensure `WHATSAPP_VERIFY_TOKEN` in Firebase matches the token in Meta dashboard
- Check Firebase Function logs for "verification failed" entries
- Verify the function is deployed: `firebase deploy --only functions`

### Signature verification fails
- Ensure `META_APP_SECRET` matches the app secret in Meta for Developers
- The raw request body must be used (not re-serialized JSON)

### Worker can't call Gemini
- Verify `GEMINI_API_KEY` is set in Supabase Edge Functions env
- Check that Gemini API is enabled in Google Cloud Console

### "auth_received" template not sending
- Ensure the template is **Approved** in Meta Business Suite
- Check that the phone number is **Verified** and **Active**
- Verify `META_ACCESS_TOKEN` has `whatsapp_business_messaging` scope
- The recipient must have messaged the business account first (for session messages) or the template must be from the `utility` category

### App says "unpublished" — no production webhooks
- Complete **Business Verification** in Meta Business Suite
- Submit **App Review** for required permissions
- Add users as **Testers** in the App Dashboard for development testing

### Local testing without deploying
```bash
# Serve the webhook function locally
firebase emulators:start --only functions

# Supabase worker can be tested via the Supabase CLI:
npx supabase functions serve whatsapp-worker
```

## Useful Links
- [Meta Cloud API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhook Setup Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Message Templates](https://developers.facebook.com/docs/whatsapp/cloud-api/templates)
- [Google AI Studio](https://aistudio.google.com/apikey)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
