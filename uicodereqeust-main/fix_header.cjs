const fs = require('fs');

const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// The header starts with <div className="sticky top-0 z-30
// It ends with {/* Modal body container */}

const headerRegex = /<div className="sticky top-0 z-30 px-5 py-4 bg-gradient-to-b[\s\S]*?\{\/\* Modal body container \*\/\}/;

const newHeader = `<div className="sticky top-0 z-30 px-5 pt-4 pb-2 bg-white border-b border-slate-200 rounded-t-[1.5rem] sm:rounded-t-[2rem] shadow-sm relative flex flex-col gap-4">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors z-40"
          >
            <X className="h-5 w-5 stroke-[2.5]" />
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pr-5 sm:pr-8">
            <div className="min-w-0 flex-1 w-full">
              <div className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-1">
                Clinical Review
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight truncate uppercase">
                {requestPatientName || "Unknown Patient"}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-slate-500 text-[11px]">
                <span>Policy: {requestPolicyNumber || "N/A"}</span>
                <span className="text-slate-300">&bull;</span>
                {role !== "hospital" ? (
                  <span>
                    {actions.otpLoading ? (
                      <span className="animate-pulse">Fetching OTPs...</span>
                    ) : (actions.arrivalOtp || actions.treatmentOtp || otpValue) ? (
                      <>
                        {actions.arrivalOtp && (
                          <span className="tracking-wider">
                            OTP: {actions.arrivalOtp}
                            {actions.arrivalOtpVerified && <span className="text-emerald-500 ml-1">âœ“</span>}
                          </span>
                        )}
                        {!actions.arrivalOtp && !actions.treatmentOtp && otpValue && <span className="tracking-wider">OTP: {otpValue}</span>}
                      </>
                    ) : ["pending", "pending_authorization", "pending_referral", "info_provided"].includes(request?.status || "") ? (
                      <span>OTP: &bull;&bull;&bull;&bull;&bull;&bull;</span>
                    ) : (
                      <span>OTP: N/A</span>
                    )}
                  </span>
                ) : (
                  <span>OTP: â€”</span>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right w-full sm:max-w-[200px] shrink-0 sm:self-center flex flex-col items-start sm:items-end mt-2 sm:mt-0">
              <div className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mb-0.5">Contact Details</div>
              <div className="text-xs font-bold text-slate-700 truncate w-full">
                {request?.patient_phone ? \`\${request.patient_phone}\` : "â€”"}
              </div>
              {request?.patient_email && (
                <div className="text-[11px] font-medium text-slate-500 truncate mt-0.5 leading-none w-full">
                  {request.patient_email === "no-email@medicode.com" ? (
                    <span className="italic opacity-70">No email provided</span>
                  ) : (
                    request.patient_email
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Process Tracker */}
          {request?.referred_hospital_name ? (
            <div className="flex flex-row items-center justify-center w-full max-w-sm mx-auto pt-2 pb-1 relative mt-1">
              <div className="absolute top-[35%] left-[5%] w-[90%] h-[2px] bg-slate-200 z-0" />
              <div className="flex justify-between w-full relative z-10">
                <div className="flex flex-col items-center gap-2 bg-transparent">
                  <div className={cn("rounded-full z-10", ["pending_referral"].includes(request.status) ? "w-3 h-3 border-4 border-slate-900 bg-white" : "w-2 h-2 bg-slate-400")} />
                  <span className={cn("text-[8px] font-black uppercase tracking-widest bg-white px-2", ["pending_referral"].includes(request.status) ? "text-slate-900" : "text-slate-400")}>Referral</span>
                </div>
                <div className="flex flex-col items-center gap-2 bg-transparent">
                  <div className={cn("rounded-full z-10", ["referral_approved"].includes(request.status) ? "w-3 h-3 border-4 border-slate-900 bg-white" : ["pending_referral"].includes(request.status) ? "w-2 h-2 bg-slate-200" : "w-2 h-2 bg-slate-400")} />
                  <span className={cn("text-[8px] font-black uppercase tracking-widest bg-white px-2", ["referral_approved"].includes(request.status) ? "text-slate-900" : ["pending_referral"].includes(request.status) ? "text-slate-300" : "text-slate-400")}>Insurer</span>
                </div>
                <div className="flex flex-col items-center gap-2 bg-transparent">
                  <div className={cn("rounded-full z-10", ["referral_accepted"].includes(request.status) ? "w-3 h-3 border-4 border-slate-900 bg-white" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "w-2 h-2 bg-slate-200" : "w-2 h-2 bg-slate-400")} />
                  <span className={cn("text-[8px] font-black uppercase tracking-widest bg-white px-2", ["referral_accepted"].includes(request.status) ? "text-slate-900" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "text-slate-300" : "text-slate-400")}>Hospital</span>
                </div>
                <div className="flex flex-col items-center gap-2 bg-transparent">
                  <div className={cn("rounded-full z-10", ["pending_authorization"].includes(request.status) ? "w-3 h-3 border-4 border-slate-900 bg-white" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "w-2 h-2 bg-slate-200" : "w-2 h-2 bg-slate-400")} />
                  <span className={cn("text-[8px] font-black uppercase tracking-widest bg-white px-2", ["pending_authorization"].includes(request.status) ? "text-slate-900" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "text-slate-300" : "text-slate-400")}>Review</span>
                </div>
                <div className="flex flex-col items-center gap-2 bg-transparent">
                  <div className={cn("rounded-full z-10", ["approved", "authorization_approved"].includes(request.status) ? "w-3 h-3 border-4 border-slate-900 bg-white" : "w-2 h-2 bg-slate-200")} />
                  <span className={cn("text-[8px] font-black uppercase tracking-widest bg-white px-2", ["approved", "authorization_approved"].includes(request.status) ? "text-slate-900" : "text-slate-300")}>Authorized</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-row items-center justify-center w-full max-w-xs mx-auto pt-2 pb-1 relative mt-1">
              <div className="absolute top-[35%] left-[10%] w-[80%] h-[2px] bg-slate-200 z-0" />
              <div className="flex justify-between w-full relative z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400 z-10" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 bg-white px-2">Verify</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-200 z-10" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-300 bg-white px-2">Review</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-200 z-10" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-300 bg-white px-2">Decision</span>
                </div>
              </div>
            </div>
          )}

          {/* TabsList */}
          <TabsList className="grid w-full grid-cols-2 h-11 sm:h-12 bg-transparent p-0 gap-2 mt-4">
            <TabsTrigger
              value="verification"
              className="rounded-[0.5rem] sm:rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=inactive]:bg-slate-100 data-[state=inactive]:text-slate-400 data-[state=active]:shadow-none transition-all h-full border-0"
            >
              Patient Verify & History
            </TabsTrigger>
            <TabsTrigger
              value="clinical"
              className="rounded-[0.5rem] sm:rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=inactive]:bg-slate-100 data-[state=inactive]:text-slate-400 data-[state=active]:shadow-none transition-all h-full border-0"
            >
              Clinical Review
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Modal body container */}`;

content = content.replace(headerRegex, newHeader);
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed sticky header and tabs');
