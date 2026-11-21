import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { removeSessionItem } from "@/lib/sessionState";
import { notifyPendingAuthorizationRequest } from "@/lib/pushNotifications";
import { HospitalRequestFormValues, isValidEmail } from "@/lib/new-request-helpers";

async function findHospitalIdByName(name: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const normalizedInput = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
  try {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .ilike("name", `%${name.trim()}%`)
      .limit(5);

    if (error || !data || data.length === 0) return null;

    for (const h of data) {
      const norm = String(h.name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
      if (norm === normalizedInput) return h.id;
    }
    return data[0].id;
  } catch (err) {
    console.error("findHospitalIdByName error:", err);
    return null;
  }
}

interface UseHospitalNewRequestSubmitOptions {
  hospitalId?: string | null;
  hospital: { id: string; name: string } | null;
  userId?: string;
  total: number;
  doctorReportPath: string | null;
  doctorReportName: string | null;
  draftKey: string | null;
  step: number;
  handleNextStep: () => Promise<void>;
}

export function useHospitalNewRequestSubmit({
  hospitalId,
  hospital,
  userId,
  total,
  doctorReportPath,
  draftKey,
  step,
  handleNextStep,
}: UseHospitalNewRequestSubmitOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const onSubmit = async (data: HospitalRequestFormValues) => {
    if (step !== 5) {
      await handleNextStep();
      return;
    }

    const refId = data.referralHospitalId;
    const refName = data.referralHospitalName || "";
    const currentHospId = hospitalId || hospital?.id;
    const currentHospName = hospital?.name || "";

    if (!currentHospId) {
      toast({
        variant: "destructive",
        title: "Facility Identification Error",
        description: "Your hospital facility account could not be identified. Please reload or contact support.",
      });
      return;
    }

    if (
      (refId && currentHospId && refId === currentHospId) ||
      (refName.trim() && currentHospName.trim() && refName.toLowerCase().trim() === currentHospName.toLowerCase().trim())
    ) {
      toast({
        variant: "destructive",
        title: "Invalid Referral",
        description: "You cannot refer a patient to your own facility.",
      });
      return;
    }

    if (!data.noEmail && (!data.patientEmail || !isValidEmail(data.patientEmail))) {
      toast({
        variant: "destructive",
        title: "Invalid email",
        description: "Enter a valid patient email address for PIN verification.",
      });
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid tariff total",
        description: "The request total must be greater than zero.",
      });
      return;
    }

    const approvedPayload = data.treatments.map((item) => ({
      code: item.code,
      name: item.name,
      category: item.category || item.subcategory || null,
      unit_price: Number(item.amount),
      quantity: Number(item.quantity),
      quantity_requires_review: false,
      price_requires_review: false,
      amount: Number(item.amount) * Number(item.quantity),
      frequency: null,
      duration: null,
      matched_via: "hospital-selected",
      matched_text: item.name,
      confidence: "high",
    }));

    setIsSubmitting(true);

    try {
      const familyPolicy = data.selectedPatient.policy_number.split("-")[0];
      const diagnosisText = data.diagnoses.join("; ");

      if (
        !data.noEmail &&
        data.patientEmail.trim() &&
        data.patientEmail.trim() !== "no-email@ronsbergerhmo.io" &&
        !data.patientEmail.trim().startsWith("no-email@") &&
        !data.patientEmail.trim().endsWith("@medicode.com")
      ) {
        const { data: emailCheck, error: emailError } = await (supabase.rpc as any)("register_policy_email", {
          p_email: data.patientEmail.trim(),
          p_family_policy: familyPolicy,
        });

        if (emailError) throw emailError;
        if (emailCheck && !emailCheck.allowed) {
          toast({
            variant: "destructive",
            title: "Email blocked",
            description: emailCheck.reason || "This email address is already associated with another policy family.",
          });
          setIsSubmitting(false);
          return;
        }
      }

      const { data: phoneCheck, error: phoneError } = await (supabase.rpc as any)("register_policy_phone", {
        p_phone: data.phone,
        p_family_policy: familyPolicy,
      });
      if (phoneError) throw phoneError;
      if (!phoneCheck?.allowed) {
        toast({
          variant: "destructive",
          title: "Phone number blocked",
          description:
            phoneCheck?.reason ||
            "Request not submitted: this patient phone number is already registered for a different family policy. No authorization request has been created.",
        });
        setIsSubmitting(false);
        return;
      }

      let resolvedReferralHospitalId = data.referralHospitalId;
      const resolvedReferralHospitalName = data.referralHospitalName?.trim() || null;
      if (!resolvedReferralHospitalId && resolvedReferralHospitalName) {
        const foundId = await findHospitalIdByName(data.referralHospitalName.trim());
        if (foundId) {
          resolvedReferralHospitalId = foundId;
        }
      }

      const isReferral = Boolean(resolvedReferralHospitalId || resolvedReferralHospitalName);
      const initialStatus = isReferral ? "pending_referral" : "pending";

      const { data: insertedRequest, error } = await supabase
        .from("authorization_requests")
        .insert({
          request_id: `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          patient_name: data.selectedPatient.full_name,
          policy_number: data.selectedPatient.policy_number,
          beneficiary_number: data.selectedPatient.beneficiary_number || null,
          patient_email: data.patientEmail.trim(),
          diagnosis: diagnosisText,
          treatment: data.treatments
            .map(
              (t) =>
                `${t.name} [Code: ${t.code}] (Qty: ${t.quantity} x NGN ${t.amount} = NGN ${t.quantity * Number(t.amount)})`
            )
            .join("; "),
          patient_phone: data.phone,
          urgency: data.urgency,
          hospital_id: hospital?.id,
          hospital_name: hospital?.name,
          requesting_hospital_id: hospital?.id,
          requesting_hospital_name: hospital?.name,
          referring_hospital_id: hospital?.id,
          referring_hospital_name: hospital?.name,
          referred_hospital_id: resolvedReferralHospitalId,
          referred_hospital_name: resolvedReferralHospitalName,
          claiming_hospital_id: resolvedReferralHospitalId || hospital?.id,
          claiming_hospital_name: resolvedReferralHospitalName || hospital?.name,
          submitted_by: userId,
          approved_items: approvedPayload,
          source: "hospital_portal",
          doctor_report_url: doctorReportPath,
          total_amount: total,
          status: initialStatus,
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!insertedRequest?.id) throw new Error("Request created but no ID returned");

      if (isReferral) {
        try {
          await supabase.from("audit_logs" as any).insert({
            action: "referral_created",
            user_id: userId,
            details: {
              request_id: insertedRequest.id,
              patient_name: data.selectedPatient.full_name,
              policy_number: data.selectedPatient.policy_number,
              referring_hospital_id: hospital?.id,
              referring_hospital_name: hospital?.name,
              referred_hospital_id: resolvedReferralHospitalId,
              referred_hospital_name: resolvedReferralHospitalName,
              status: initialStatus,
            },
            severity: "info",
          });
        } catch (err) {
          console.error("Failed to insert audit log for referral", err);
        }
      }

      if (
        (data.phone && data.phone.trim().length >= 10) ||
        (data.patientEmail &&
          data.patientEmail.trim() !== "no-email@ronsbergerhmo.io" &&
          !data.patientEmail.trim().startsWith("no-email@") &&
          !data.patientEmail.trim().endsWith("@medicode.com"))
      ) {
        supabase.functions
          .invoke("send-submission-notification", {
            body: {
              phone_number: data.phone,
              patient_email: data.patientEmail,
              patient_name: data.selectedPatient?.full_name,
              hospital_name: hospital?.name,
              diagnoses: data.diagnoses,
              urgency: data.urgency,
              requested_items: data.treatments.map((t: any) => ({ quantity: t.quantity, name: t.name })),
            },
          })
          .catch((err) => console.error("Failed to send submission notification", err));
      }

      void notifyPendingAuthorizationRequest({
        requestId: insertedRequest.id,
        hospitalName: hospital?.name,
        source: "hospital_portal",
      });

      try {
        let fnResult: any = {};
        let otpError: any = null;
        const isNoEmail =
          data.patientEmail.trim() === "no-email@ronsbergerhmo.io" ||
          data.patientEmail.trim().startsWith("no-email@") ||
          data.patientEmail.trim().endsWith("@medicode.com");

        if (isReferral) {
          const { data: otpData, error: otpErr } = await supabase.functions.invoke("send-otp", {
            method: "POST",
            body: {
              authorization_id: insertedRequest.id,
              patient_email: data.patientEmail.trim() || "no-email@ronsbergerhmo.io",
              policy_number: data.selectedPatient.policy_number,
              otp_type: "ARRIVAL",
              hospital_id: resolvedReferralHospitalId || hospital?.id,
            },
          });
          fnResult = otpData || {};
          otpError = otpErr;

          if (otpError && !fnResult.message) {
            toast({
              variant: "destructive",
              title: "PIN generation failed",
              description: otpError?.message || "Could not generate PIN.",
            });
          } else if (fnResult.error) {
            toast({
              variant: "destructive",
              title: "PIN generation failed",
              description: fnResult.message || "Could not generate PIN.",
            });
          } else {
            toast({
              title: "Referral request submitted",
              description: isNoEmail
                ? `Referral to ${resolvedReferralHospitalName || "hospital"} submitted. The Arrival PIN will be sent via WhatsApp upon approval.`
                : `Referral submitted. The Arrival PIN will be emailed to the patient upon approval.`,
            });
          }
        } else {
          toast({
            title: "Request submitted successfully",
            description: isNoEmail
              ? "Request submitted to HMO. The Treatment PIN will be sent via WhatsApp to the patient upon approval."
              : "Request submitted to HMO. The Treatment PIN will be emailed to the patient upon approval.",
          });
        }
      } catch (err: any) {
        console.error("PIN generation failed:", err);
        toast({
          variant: "destructive",
          title: "PIN generation failed",
          description: err?.message || "Could not generate PIN.",
        });
      }

      if (draftKey) removeSessionItem(draftKey);
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Request submission error:", err);
      toast({ variant: "destructive", title: "Submission failed", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    onSubmit,
  };
}
