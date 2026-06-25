// @ts-nocheck — Deno Edge Function, checked by Supabase CLI, not browser TypeScript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, getServiceClient, parseBrevoSender, validateUser } from "../_shared/auth.ts"

serve(async (req) => {
  // Handle CORS OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Validate request: Must be either an admin user or authorized via CRON_SECRET header
    const cronSecretHeader = req.headers.get("X-Cron-Secret");
    const cronSecretEnv = Deno.env.get("DAILY_REPORT_CRON_SECRET") || "3e8f8a8b-6c7b-4c5b-9d8e-7f6e5d4c3b2a";

    let isAuthorized = false;

    if (cronSecretHeader && cronSecretHeader === cronSecretEnv) {
      isAuthorized = true;
    } else {
      try {
        await validateUser(req, ["admin"]);
        isAuthorized = true;
      } catch (err) {
        console.warn("Unauthorized daily-report access attempt:", err.message);
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO Reports <noreply@ronsbergerhmo.com>";

    if (!brevoApiKey) {
      console.warn("⚠️ BREVO_API_KEY is not set - daily report will not be sent");
      throw new Error('BREVO_API_KEY is not set')
    }

    console.log("📊 Starting daily report generation...");
    const supabaseClient = getServiceClient()

    // Check if triggered manually with a JSON payload (e.g. force: true)
    let forceSend = false
    if (req.method === "POST") {
      try {
        const payload = await req.json()
        if (payload && payload.force === true) {
          forceSend = true
        }
      } catch (_) {
        // Body was empty or not valid JSON, proceed normally
      }
    }

    // Fetch daily report settings dynamically from global_policies
    const { data: policyData, error: policyError } = await supabaseClient
      .from('global_policies')
      .select('value')
      .eq('key', 'daily_report_settings')
      .maybeSingle()

    if (policyError) {
      console.error("Error reading daily_report_settings policy:", policyError)
    }

    let recipientEmail = Deno.env.get("DAILY_REPORT_EMAIL") || 'ayobolanleafolayan@gmail.com'
    let isEnabled = true

    if (policyData && policyData.value) {
      if (policyData.value.email) {
        recipientEmail = String(policyData.value.email).trim()
      }
      if (policyData.value.enabled !== undefined) {
        isEnabled = !!policyData.value.enabled
      }
    }

    // If daily report is disabled and not forced, skip execution
    if (!isEnabled && !forceSend) {
      return new Response(JSON.stringify({ message: "Daily report automation is disabled. Skipping email." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // Calculate start and end of "today" (last 24 hours for daily report at midnight)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 1)

    // Retrieve all requests updated/created in the last 24 hours to ensure full capture
    const { data: records, error } = await supabaseClient
      .from('authorization_requests')
      .select('*')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())

    if (error) throw error

    // For a forced test send, continue even with no records and send a test email
    if (!forceSend && (!records || records.length === 0)) {
      return new Response(JSON.stringify({ message: "No authorizations in the last 24 hours. Skipping email." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // If test mode and no real records, use a placeholder so email delivery can be verified
    const effectiveRecords = (records && records.length > 0) ? records : [];
    const isTestWithNoRecords = forceSend && effectiveRecords.length === 0;

    const approvedRecords = effectiveRecords.filter((r: any) => r.status === 'approved')
    const totalAmount = approvedRecords.reduce((sum: number, r: any) => sum + (r.total_amount || 0), 0)
    
    // Build HTML email body
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background: linear-gradient(135deg,#0F6E56 0%,#0a5242 100%); padding: 28px 32px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
          <div style="margin-bottom: 14px;">
            <img src="https://medicodeui.web.app/ronsberger-logo.png" alt="Ronsberger HMO Logo" width="52" height="52" style="display:inline-block;border-radius:10px;background:rgba(255,255,255,0.15);padding:6px;object-fit:contain;" />
          </div>
          <div style="margin-bottom: 10px;">
            <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Ronsberger </span><span style="color:#93c34b;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">HMO</span>
          </div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em;">Intelligence Portal</h1>
          <p style="margin: 6px 0 0; font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.05em; text-transform: uppercase;">Daily Pre-Authorization Audit &amp; Reconciliation Report</p>
        </div>

        ${isTestWithNoRecords ? '<div style="background:#fef9c3;border:1px solid #fde047;padding:12px 16px;border-radius:8px;margin-bottom:16px;"><p style="margin:0;font-size:11px;font-weight:800;color:#854d0e;">⚠️ TEST EMAIL — No authorizations were processed in the last 24 hours. This email confirms your delivery settings are working correctly.</p></div>' : ''}
        <p>Hello Admin,</p>
        <p>Please find attached the daily system authorization report CSV spreadsheet for today, <strong>${end.toLocaleDateString("en-GB")}</strong>. This report captures all clinical queue activities, including comprehensive patient enrollment IDs, clinical diagnoses, requested treatments, and issuing facilities.</p>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0;">
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; tracking-widest: 0.1em;">Total Queue Load</p>
            <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 900; color: #0f172a;">${effectiveRecords.length}</p>
          </div>
          <div style="background-color: #ecfdf5; border: 1px solid #d1fae5; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #059669; tracking-widest: 0.1em;">Approved Requests</p>
            <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 900; color: #059669;">${approvedRecords.length}</p>
          </div>
          <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #16a34a; tracking-widest: 0.1em;">Net Approved Value</p>
            <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 900; color: #16a34a;">₦${totalAmount.toLocaleString()}</p>
          </div>
        </div>

        <h3 style="color: #0f172a; margin-top: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em;">Approved Transactions Preview (Top 10)</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; margin-top: 12px;">
          <thead>
            <tr style="background-color: #f8fafc; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 10px; font-weight: 900;">Auth Code</th>
              <th style="padding: 10px; font-weight: 900;">Patient Name</th>
              <th style="padding: 10px; font-weight: 900;">Hospital</th>
              <th style="padding: 10px; font-weight: 900;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${approvedRecords.slice(0, 10).map((r: any) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px; font-weight: bold; font-family: monospace; color: #2563eb;">${r.authorization_code || 'N/A'}</td>
                <td style="padding: 10px; font-weight: 700; color: #334155;">${r.patient_name}</td>
                <td style="padding: 10px; color: #475569;">${r.requesting_hospital || r.hospital_name || 'N/A'}</td>
                <td style="padding: 10px; color: #16a34a; font-weight: bold;">₦${(r.total_amount || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
            ${approvedRecords.length > 10 ? `
              <tr>
                <td colspan="4" style="padding: 10px; text-align: center; color: #64748b; font-style: italic;">...and ${approvedRecords.length - 10} more approved transactions listed in the attached spreadsheet.</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        
        <p style="margin-top: 40px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          This is an automated system email from the Ronsberger HMO Portal. Please do not reply directly to this mail.
        </p>
      </div>
    `;

    // Generate CSV data according to customer schema:
    const headers = [
      "S/N",
      "Date",
      "Request ID",
      "Patient Name",
      "Phone Number",
      "NHIS/ID",
      "Diagnosis",
      "Service/Treatment",
      "Hospital",
      "Source",
      "Auth Code",
      "Status",
      "Decision Reason"
    ];

    const csvRows = effectiveRecords.map((r: any, i: number) => {
      const row = [
        String(i + 1),
        new Date(r.created_at).toLocaleDateString("en-GB"),
        r.request_id || "N/A",
        r.patient_name || "N/A",
        r.patient_phone || "N/A",
        r.policy_number || "N/A",
        r.diagnosis || "N/A",
        r.treatment || "N/A",
        r.requesting_hospital || r.hospital_name || "N/A",
        r.source || "Manual",
        r.authorization_code || "N/A",
        r.status || "N/A",
        r.rejection_reason || r.notes || "N/A"
      ];
      return row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");
    
    // Base64 encode using binary-safe method
    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(csvContent);
    
    let binary = "";
    const len = csvBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(csvBytes[i]);
    }
    const base64Csv = btoa(binary);

    const brevoSender = parseBrevoSender(brevoFromRaw);

    console.log(`📧 Sending daily report to ${recipientEmail}...`);
    console.log(`From: ${brevoSender.name} <${brevoSender.email}>`);
    console.log(`Records included: ${effectiveRecords.length}`);

    // Send email using Brevo with Base64 attachment
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: brevoSender,
        to: [{ email: recipientEmail }],
        subject: `${forceSend ? '[TEST] ' : ''}Ronsberger HMO Daily Pre-Auth Report - ${end.toLocaleDateString("en-GB")}`,
        htmlContent: htmlContent,
        attachment: [
          {
            name: `RonsbergerHMO_Daily_Report_${end.toISOString().split('T')[0]}.csv`,
            content: base64Csv
          }
        ]
      })
    });

    const emailData = await emailResponse.json();
    console.log(`Brevo response status: ${emailResponse.status}`, emailData);

    if (!emailResponse.ok) {
      const errorMsg = `Email send failed: ${JSON.stringify(emailData)}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`✅ Daily report sent successfully to ${recipientEmail}`);
    return new Response(JSON.stringify({ message: `Daily report sent successfully to ${recipientEmail}`, data: emailData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error('❌ daily-report error:', error.message);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
})