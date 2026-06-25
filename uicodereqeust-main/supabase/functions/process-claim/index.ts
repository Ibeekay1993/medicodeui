// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await validateUser(req, ["claims"]);
    const { claim_id, action, notes } = await req.json();

    if (!claim_id || !["investigate", "approve", "pay", "reject"].includes(action)) {
      throw new Error("Invalid action");
    }

    const supabase = getServiceClient();
    const { data: claim, error: claimError } = await supabase
      .from("hospital_claims")
      .select("*")
      .eq("id", claim_id)
      .maybeSingle();

    if (claimError || !claim) throw new Error("Claim not found");

    const updateData: Record<string, unknown> = {
      notes: notes || claim.notes || "",
    };

    if (action === "investigate") {
      if (claim.status !== "submitted") throw new Error("Can only investigate pending submitted claims");
      updateData.status = "under_review";
    } else if (action === "approve") {
      if (!["submitted", "under_review"].includes(claim.status)) {
        throw new Error("Can only approve pending or investigating claims");
      }
      updateData.status = "approved";
    } else if (action === "pay") {
      if (claim.status !== "approved") throw new Error("Can only pay approved claims");
      updateData.status = "paid";
      updateData.payment_note = notes || `PAY-${Date.now()}`;
    } else if (action === "reject") {
      if (claim.status === "paid") throw new Error("Paid claims cannot be rejected");
      updateData.status = "rejected";
    }

    const { error } = await supabase
      .from("hospital_claims")
      .update(updateData)
      .eq("id", claim_id);

    if (error) throw error;

    const claimStatus =
      updateData.status === "under_review"
        ? "under_investigation"
        : updateData.status === "approved"
          ? "approved"
          : updateData.status === "paid"
            ? "paid"
            : updateData.status === "rejected"
              ? "rejected"
              : "submitted";

    await supabase
      .from("authorization_requests")
      .update({
        claimed: true,
        claim_status: claimStatus,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", claim.request_id);

    await supabase.from("audit_logs").insert({
      action: `CLAIM_${String(action).toUpperCase()}`,
      user_id: user.id,
      details: { claim_id, action, amount: claim.total_amount },
      severity: action === "pay" ? "info" : "warning",
    }).then(() => undefined);

    return new Response(JSON.stringify({
      success: true,
      claim_id,
      status: updateData.status,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Claim action failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
