# Email System Setup & Troubleshooting Guide

## 🔧 What I Fixed

I've improved the email system with the following updates:

### 1. **Consolidated Module Imports**
   - All functions now properly import shared modules (`cors`, `auth`, `parseBrevoSender`)
   - Reduced code duplication across `send-otp`, `send-approval-email`, and `daily-report`
   - Standardized error handling and logging

### 2. **Added Comprehensive Logging**
   - Debug logs for API key checks
   - Request/response logging for Brevo API calls
   - Clear success/failure indicators in console output
   - Detailed error messages for troubleshooting

### 3. **Improved Error Handling**
   - Better validation of Brevo API responses
   - Clearer error messages for configuration issues
   - Proper exception handling with detailed logging

---

## ⚠️ Critical Issue: Brevo API Key

**This is likely why emails aren't being received!**

The email functions check for `BREVO_API_KEY` environment variable. If not set:
- OTP emails are skipped
- Approval emails are skipped  
- Daily reports are skipped

### Solution: Set Environment Variables

You need to configure these in your Supabase project:

#### **In Supabase Dashboard:**
1. Go to your project settings
2. Navigate to **Functions** → **Configuration**
3. Add these secrets:

```
BREVO_API_KEY=<your-brevo-api-key>
BREVO_FROM_EMAIL=MedAuth OTP <noreply@medauth.app>
DAILY_REPORT_EMAIL=your-admin-email@company.com
```

#### **Key Names & What They Do:**

| Key | Value | Purpose |
|-----|-------|---------|
| `BREVO_API_KEY` | Your Brevo SMTP key | **REQUIRED** - enables all email sending |
| `BREVO_FROM_EMAIL` | Sender email (format: `Name <email@domain>`) | Optional - defaults to "MedAuth OTP <noreply@medauth.app>" |
| `DAILY_REPORT_EMAIL` | Admin email address | Optional - defaults to a placeholder |
| `SUPABASE_URL` | Your Supabase URL | Auto-set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Auto-set by Supabase |
| `SUPABASE_ANON_KEY` | Anon key | Auto-set by Supabase |

---

## 📧 How to Get Brevo API Key

1. Go to [Brevo.com](https://www.brevo.com) (formerly Sendinblue)
2. Create/login to your account
3. Go to **Settings** → **SMTP & API** → **API Keys**
4. Create a new API key (or use existing one)
5. Copy the API key and add it to Supabase

---

## 🧪 Testing the Email System

### **Test 1: OTP Email**
```bash
# Using curl or Postman
POST /functions/v1/send-otp
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "authorization_id": "test-auth-123",
  "patient_email": "test@example.com",
  "policy_number": "POL-12345"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully via email",
  "email_status": "sent"
}
```

**Check Logs:** Look for these messages:
- ✅ `✅ OTP email sent successfully. Message ID: [id]`
- ❌ `❌ Brevo API error: ...`
- ⚠️ `⚠️ BREVO_API_KEY not configured`

### **Test 2: Approval Email**
```bash
POST /functions/v1/send-approval-email
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "authorization_id": "test-auth-123"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval email sent",
  "email_status": "sent"
}
```

### **Test 3: Daily Report** 
```bash
POST /functions/v1/daily-report
Content-Type: application/json

{
  "force": true
}
```

**Expected Response:**
```json
{
  "message": "Daily report sent successfully to [email]",
  "data": { "messageId": "[brevo-message-id]" }
}
```

---

## 🔍 Troubleshooting

### **Problem: "Email skipped" or "BREVO_API_KEY not configured"**
- ✅ Verify `BREVO_API_KEY` is set in Supabase project settings
- ✅ Check Supabase function logs for confirmation
- ✅ Redeploy functions after adding the key

### **Problem: "Email send failed" (HTTP errors)**
- Check the error message in response
- Common errors:
  - `401 Unauthorized` - API key is invalid
  - `400 Bad Request` - Invalid email format or sender format
  - `429 Too Many Requests` - Rate limit exceeded

### **Problem: Emails not arriving in inbox**
- ✅ Check spam/junk folder
- ✅ Verify recipient email is correct in the request
- ✅ Check if Brevo account has sending limits
- ✅ Verify sender domain is verified in Brevo

### **Problem: Email templates look broken**
- The HTML templates in the code are well-formatted
- Check Brevo API response for HTML validation errors
- Ensure the email client supports the styling

---

## 📊 Email System Architecture

```
┌─────────────────────────────────────────┐
│  API Request (send-otp, send-approval)  │
└────────────────┬────────────────────────┘
                 │
                 ▼
         ┌──────────────────┐
         │  Validate User   │
         │  (from auth.ts)  │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Check BREVO Key  │◄──── CRITICAL: Must be set!
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Build Email HTML │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Brevo API Call  │
         │ (v3/smtp/email)  │
         └────────┬─────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
    Success          Failure/Error
    ✅ sent          ❌ failed
    Log to DB        Log error
```

---

## 📝 Database Schema

The system logs all email activity:

**email_logs table:**
- `id` - Log entry ID
- `provider` - Always "brevo"
- `recipient` - Recipient email
- `subject` - Email subject
- `status` - "sent", "failed", or "skipped"
- `response_id` - Brevo message ID (if successful)
- `error_message` - Error details (if failed)
- `authorization_id` - Related auth request
- `created_at` - Timestamp

**audit_logs table:**
- Tracks all email-related actions
- Useful for debugging and compliance

---

## 🚀 Next Steps

1. **Immediate:** Set `BREVO_API_KEY` in Supabase project settings
2. **Test:** Run the test commands above to verify emails send
3. **Monitor:** Check Supabase function logs during testing
4. **Verify:** Confirm emails arrive in recipient inboxes
5. **Deploy:** Once working, monitor production usage

---

## 💡 Pro Tips

- Enable Brevo webhooks to track delivery/bounce events
- Set up email verification to prevent bounces
- Monitor rate limits (default: 5 OTPs per email per 15 min)
- Archive old email_logs entries periodically
- Test with your own email first before using patient emails

---

## 📞 Support

If emails still aren't working after these steps:
1. Check Supabase function logs (real-time)
2. Verify Brevo account status and limits
3. Test Brevo API key directly using Brevo docs
4. Ensure sender email is verified in Brevo
5. Check that patient_email format is valid
