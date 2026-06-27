import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessageSquare, Save, Wand2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const whatsappSamples = [
  {
    title: "Malaria request",
    body: `From: General Hospital Lagos
Patient Name: Adewale Musa
NHIA No: NHIA/GHL/2025/001
Phone: 08012345678
Diagnosis: Severe malaria with dehydration
Treatment: Artemether Lumefantrine
Full Blood Count
Malaria Parasite Test`,
  },
  {
    title: "Referral request",
    body: `Hospital: Central Medical Centre
Name: Mariam Okafor
Policy Number: NHIA/CMC/2025/002
Tel: 08098765432
Diagnosis: Hypertension with persistent headache
Referred To: City Care Specialist Clinic
Services: Specialist Consultation
Lisinopril 10mg Tablets`,
  },
  {
    title: "Claims-ready care",
    body: `Sender: Unity Medical Centre
Patient: Grace Adams
Enrollee Number: NHIA/UMC/2025/005
Contact: 08155550123
Diagnosis: Right upper abdominal pain
Treatment: Abdominal Ultrasound Scan
Specialist Consultation
Admission Bed Day`,
  },
];

export default function WhatsAppPage() {
  const [rawText, setRawText] = useState(() => sessionStorage.getItem("ronsberger_whatsapp_raw") || "");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parsedData, setParsedData] = useState<any>(() => {
    const saved = sessionStorage.getItem("ronsberger_whatsapp_parsed");
    return saved ? JSON.parse(saved) : null;
  });
  const { toast } = useToast();
  const { user } = useAuth();

  const normalizeLine = (value: string) =>
    value
      .replace(/\r/g, "")
      .replace(/[*•]/g, "")
      .replace(/^[\s\-–—•]+/, "")
      .trim();

  const isSectionHeader = (line: string) =>
    /^(?:date|from|hospital|clinic|sender|referral|phone|tel|contact|patient|name|diagnosis|policy|enrollee|services?|treatments?|drugs?|rx)[:\s-]*$/i.test(line);

  const isSectionStart = (line: string) => {
    const l = line.trim();
    const prefixPattern =
      /^(?:(?:full\s*name|patient\s*name|name|patient)(?!\s*(?:no\.?|number|num))|(?:nhis|nhia|policy|enrollee|family|id)(?:\s*(?:no\.?|number|num|code))?|(?:diagnosis|diag)|(?:phone|tel|contact|telephone)(?:\s*(?:no\.?|number|num))?|(?:from|hospital|clinic|sender)|(?:referred\s*to|refer\s*to|referral\s*to|treatment\s*at|provider\s*code\s*issued\s*to|send\s*to|transferred\s*to)|(?:services?|treatments?|drugs?|rx))\b/i;

    if (!prefixPattern.test(l)) {
      return false;
    }

    if (new RegExp(prefixPattern.source + "\\s*[:\\-]", "i").test(l)) {
      return true;
    }

    const hospitalPattern = /^(?:from|hospital|clinic|sender|referred\s*to|refer\s*to|referral\s*to|treatment\s*at|provider\s*code\s*issued\s*to|send\s*to|transferred\s*to)\b\s+/i;
    if (hospitalPattern.test(l)) {
      return true;
    }

    const phonePattern = /^(?:phone|tel|contact|telephone)\b(?:\s*(?:no\.?|number|num))?\s+\+?[0-9]/i;
    if (phonePattern.test(l)) {
      return true;
    }

    return false;
  };

  useEffect(() => {
    sessionStorage.setItem("ronsberger_whatsapp_raw", rawText);
  }, [rawText]);

  useEffect(() => {
    if (parsedData) {
      sessionStorage.setItem("ronsberger_whatsapp_parsed", JSON.stringify(parsedData));
    } else {
      sessionStorage.removeItem("ronsberger_whatsapp_parsed");
    }
  }, [parsedData]);

  const handleParse = async () => {
    if (!rawText.trim()) {
      toast({ variant: "destructive", title: "Empty input", description: "Please paste a WhatsApp message to parse." });
      return;
    }
    
    setIsParsing(true);
    try {
      const normalizedText = rawText.replace(/\r/g, "").replace(/\*/g, "");
      const lines = normalizedText
        .split("\n")
        .map((line) => normalizeLine(line))
        .filter((line) => line !== "");
      
      const data: any = {
        patient_name: "",
        policy_number: "",
        diagnosis: "",
        treatment: "",
        hospital_name: "",
        patient_phone: "",
        clinical_notes: "",
        hospital_id: null,
        referral_hospital_id: null,
        referral_hospital_name: ""
      };

      let treatmentFound = false;
      const treatmentLines = [];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        const lLower = l.toLowerCase();

        // Treatment block accumulation
        if (treatmentFound) {
           if (isSectionHeader(l) || isSectionStart(l)) {
              treatmentFound = false;
           } else {
              treatmentLines.push(l);
              continue;
           }
        }

        // More robust matching for various formats
        if (!data.patient_name) {
          const m1 = l.match(/^(?:full\s*name|patient\s*name|name|patient)(?!\s*(?:no\.?|number|num))\s*[:\-]?\s*(.+)/i);
          if (m1) data.patient_name = m1[1].trim();
        }
        if (!data.policy_number) {
          const m2 = l.match(/^(?:nhis|nhia|policy|enrollee|family|id)\b(?:\s*(?:no\.?|number|num|code))?\s*[:\-]?\s*([A-Z0-9/\-]+)/i);
          if (m2) data.policy_number = m2[1].trim();
        }
        if (!data.diagnosis) {
          const m3 = l.match(/^(?:diagnosis|diag)\s*[:\-]?\s*(.+)/i);
          if (m3) data.diagnosis = m3[1].trim();
        }
        if (!data.patient_phone) {
          const m4 = l.match(/^(?:phone|tel|contact|telephone)\b(?:\s*(?:no\.?|number|num))?\s*[:\-]?\s*([0-9\+\s\-\(\)]+)/i);
          if (m4) data.patient_phone = m4[1].trim();
        }
        if (!data.hospital_name) {
          const m5 = l.match(/^(?:from|hospital|clinic|sender)\b\s*[:\-]?\s*(.+)/i);
          if (m5) data.hospital_name = m5[1].trim();
        }
        if (!data.referral_hospital_name) {
          const m6 = l.match(/^(?:referred\s*to|refer\s*to|referral\s*to|treatment\s*at|provider\s*code\s*issued\s*to|send\s*to|transferred\s*to)\b\s*[:\-]?\s+(.+)/i);
          if (m6) data.referral_hospital_name = m6[1].trim();
        }

        if (/^(?:services?|treatments?|drugs?|rx)[:\s-]*/i.test(lLower)) {
          treatmentFound = true;
          const firstLine = l.replace(/^(?:services?|treatments?|drugs?|rx)[:\s-]*/i, "").trim();
          if (firstLine) treatmentLines.push(firstLine);
        }
      }

      data.treatment = treatmentLines.join("\n").trim();

      // Hospital Matching
      if (data.hospital_name) {
         const searchName = data.hospital_name.split(" ").slice(0, 3).join(" ");
         const { data: matchedHospitals } = await supabase
            .from("hospitals")
            .select("id, name")
            .ilike("name", `%${searchName}%`)
            .limit(1);
            
         if (matchedHospitals && matchedHospitals.length > 0) {
            data.hospital_id = matchedHospitals[0].id;
            data.hospital_name = matchedHospitals[0].name;
         }
      } else {
         data.hospital_name = "";
      }

      if (data.referral_hospital_name) {
         const searchName = data.referral_hospital_name.split(" ").slice(0, 3).join(" ");
         const { data: matchedReferralHospitals } = await supabase
            .from("hospitals")
            .select("id, name")
            .or(`name.ilike.%${searchName}%,code.ilike.%${data.referral_hospital_name}%`)
            .limit(1);

         if (matchedReferralHospitals && matchedReferralHospitals.length > 0) {
            data.referral_hospital_id = matchedReferralHospitals[0].id;
            data.referral_hospital_name = matchedReferralHospitals[0].name;
         }
         data.clinical_notes = `Referral requested for ${data.referral_hospital_name}.`;
      }

      setParsedData(data);
      toast({ title: "Extraction Complete", description: "Direct text extraction was successful." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Parse Error", description: error.message });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedData) return;
    setIsSaving(true);
    try {
      // Re-match hospital name to get the correct hospital_id
      let hospitalId = parsedData.hospital_id || null;
      let hospitalName = parsedData.hospital_name;
      if (hospitalName && !hospitalId) {
        const searchName = hospitalName.split(" ").slice(0, 3).join(" ");
        const { data: matchedHospitals } = await supabase
          .from("hospitals")
          .select("id, name")
          .ilike("name", `%${searchName}%`)
          .limit(1);
        if (matchedHospitals && matchedHospitals.length > 0) {
          hospitalId = matchedHospitals[0].id;
          hospitalName = matchedHospitals[0].name;
        }
      }

      const { error } = await supabase.from("authorization_requests").insert([{
        patient_name: parsedData.patient_name,
        policy_number: parsedData.policy_number,
        diagnosis: parsedData.diagnosis,
        treatment: parsedData.treatment,
        hospital_name: hospitalName,
        hospital_id: hospitalId,
        requesting_hospital_id: hospitalId,
        requesting_hospital_name: hospitalName,
        referring_hospital_id: hospitalId,
        referring_hospital_name: hospitalName,
        referred_hospital_id: parsedData.referral_hospital_id || null,
        referred_hospital_name: parsedData.referral_hospital_name || null,
        claiming_hospital_id: parsedData.referral_hospital_id || hospitalId,
        claiming_hospital_name: parsedData.referral_hospital_name || hospitalName,
        patient_phone: parsedData.patient_phone || null,
        clinical_notes: parsedData.clinical_notes || null,
        whatsapp_raw_message: rawText,
        status: "pending",
        source: "whatsapp_parser",
        submitted_by: user?.id,
        request_id: `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        urgency: "routine"
      }]);

      if (error) throw error;
      
      toast({ title: "Request Created", description: "The authorization request has been added to the queue." });
      setRawText("");
      setParsedData(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">

      <div className="grid gap-2 md:grid-cols-3">
        {whatsappSamples.map((sample) => (
          <button
            key={sample.title}
            type="button"
            onClick={() => {
              setRawText(sample.body);
              setParsedData(null);
              toast({ title: "Sample loaded", description: "Click Extract Details to parse this WhatsApp message." });
            }}
            className="rounded-xl border border-emerald-100 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">{sample.title}</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{sample.body}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="p-4 border-b border-slate-50 bg-slate-50/50">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              Raw Message Input
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col gap-4">
            <Textarea 
              placeholder="Paste WhatsApp message here...&#10;e.g.&#10;Name: John Doe&#10;Policy: 12345678&#10;Diagnosis: Malaria&#10;Treatment: Artemether Lumefantrine" 
              className="min-h-[250px] resize-none border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 text-sm"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <Button 
              onClick={handleParse} 
              disabled={isParsing || !rawText.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl flex items-center gap-2"
            >
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Extract Details
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-100 bg-slate-50/50 shadow-sm overflow-hidden flex flex-col relative">
          <CardHeader className="p-4 border-b border-slate-100 bg-white">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Extracted Payload
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col gap-4 relative">
            {!parsedData ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <AlertTriangle className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Waiting for Parse</p>
                <p className="text-xs font-bold text-slate-400">Paste text and extract to see the generated request payload.</p>
              </div>
            ) : (
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Patient Name</p>
                    <p className="font-bold text-slate-900 border-b border-slate-200 pb-1">{parsedData.patient_name || "---"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Policy Number</p>
                    <p className="font-mono font-bold text-slate-900 border-b border-slate-200 pb-1">{parsedData.policy_number || "---"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Phone No.</p>
                    <p className="font-mono text-slate-900 border-b border-slate-200 pb-1">{parsedData.patient_phone || "---"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Requesting Hospital</p>
                    <input
                      type="text"
                      value={parsedData.hospital_name || ""}
                      onChange={(e) => setParsedData((prev: any) => ({ ...prev, hospital_name: e.target.value }))}
                      placeholder="Type hospital name..."
                      className="w-full text-sm font-semibold text-slate-900 border-b-2 border-slate-200 pb-1 leading-tight break-words bg-transparent outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-300"
                    />
                    {!parsedData.hospital_name?.trim() && (
                      <p className="text-[10px] font-bold text-amber-600 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" /> Hospital name is required before saving
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-600">Referral / Treating Hospital</p>
                    <p className="text-sm font-black text-blue-900 leading-tight break-words">{parsedData.referral_hospital_name || "No referral detected"}</p>
                    {parsedData.referral_hospital_name ? (
                      <p className="mt-1 text-xs font-semibold text-blue-800">Claims and payment will belong to this hospital.</p>
                    ) : null}
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Diagnosis</p>
                    <p className="font-semibold text-slate-900 border-b border-slate-200 pb-1 break-words">{parsedData.diagnosis || "---"}</p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Treatment / Services</p>
                    <p className="font-semibold text-slate-900 border-b border-slate-200 pb-1 break-words">{parsedData.treatment || "---"}</p>
                  </div>
                  {parsedData.clinical_notes && (
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs font-black uppercase tracking-widest text-blue-500">Referral Notes</p>
                      <p className="font-semibold text-blue-900 border-b border-blue-200 pb-1 break-words bg-blue-50/50 rounded px-2">{parsedData.clinical_notes}</p>
                    </div>
                  )}
                </div>
                
                <div className="pt-4 mt-auto">
                  <Button 
                    onClick={handleSave} 
                    disabled={isSaving || !parsedData.hospital_name?.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save to Queue
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
