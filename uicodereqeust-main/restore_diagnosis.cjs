const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const updatedDiagnosisCard = `                {/* Diagnosis Card */}
                <div className="bg-white rounded-2xl p-4 border border-slate-100 mb-3 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                      {request?.referred_hospital_name ? "Original Referral Diagnosis" : "Proposed Diagnosis"}
                      {request?.referred_hospital_name && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest">Referral</span>}
                    </div>
                    <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[9px] font-bold text-slate-500 tracking-wide">
                      {request?.diagnosis_code || "ICD-10"}
                    </div>
                  </div>
                  
                  <textarea 
                    className="w-full p-3 border border-slate-200 rounded-xl text-[14px] font-bold text-slate-800 bg-white min-h-[70px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Diagnosis..."
                    value={actions.editDiagnosis}
                    onChange={(e) => actions.setEditDiagnosis(e.target.value)}
                    readOnly={request?.deletion_status === "awaiting_admin_approval" || role === "hospital" || !!request?.referred_hospital_name}
                  />

                  <div className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2 pt-2 border-t border-slate-100">
                    {request?.referred_hospital_name ? "Current Treatment Request" : "Proposed Treatment"}
                    {request?.referred_hospital_name && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest">Referred Hospital</span>}
                  </div>
                  
                  <textarea 
                    className="w-full p-3 border border-slate-200 rounded-xl text-[14px] font-semibold text-slate-800 bg-white min-h-[90px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Treatment Plan..."
                    value={actions.editTreatment}
                    onChange={(e) => actions.setEditTreatment(e.target.value)}
                    onBlur={() => {
                      if (role === "hospital" || !(["hospital", "hospital_portal"].includes(role))) return;
                      void tariffSearch.parseTreatmentText({ replaceAuto: true, quiet: true });
                    }}
                    readOnly={request?.deletion_status === "awaiting_admin_approval" || role === "hospital"}
                  />
                  
                  {/* Referral details container */}
                  <div className="space-y-3.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm mt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-700">
                          Referral Hospital / Claim Owner
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">
                          {actions.referralCollapsed
                            ? "Tap arrow to view referral details"
                            : "Specify treating hospital details if this authorization requires a referral."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => actions.setReferralCollapsed((current) => !current)}
                        className="h-8 w-8 shrink-0 rounded-xl text-slate-600 hover:bg-slate-100"
                      >
                        {actions.referralCollapsed ? (
                          <ChevronDown className="h-4.5 w-4.5" />
                        ) : (
                          <ChevronUp className="h-4.5 w-4.5" />
                        )}
                      </Button>
                    </div>

                    {!actions.referralCollapsed && (
                      <div className="mt-3.5 space-y-3 animate-in fade-in duration-200">
                        <HospitalReferralField
                          label="Referral Hospital / Claim Owner"
                          value={actions.editReferralHospitalName}
                          selectedId={actions.editReferralHospitalId}
                          excludeHospitalId={request?.requesting_hospital_id || request?.hospital_id}
                          excludeHospitalName={request?.requesting_hospital_name || request?.hospital_name}
                          onChange={(next) => {
                            actions.setEditReferralHospitalId(next.id);
                            actions.setEditReferralHospitalName(next.name);
                          }}
                          helperText="If this is a referral, the authorization code remains visible to the requester, but claim submission and payment belong only to this treating hospital."
                          disabled={request?.deletion_status === "awaiting_admin_approval" || role === "hospital"}
                        />
                        {actions.editReferralHospitalName.trim() ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold leading-relaxed text-slate-700 shadow-sm">
                            Request raised by: {request.requesting_hospital_name || request.hospital_name || "Original hospital"}
                            <br />
                            Treatment and claims assigned to: {actions.editReferralHospitalName.trim()}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-500">
                            No referral selected. Claims stay with {request.hospital_name || "the requesting hospital"}.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>`;

const regex = /\{\/\* Diagnosis Card \*\/\}.*?<\/div>/s;
content = content.replace(regex, updatedDiagnosisCard);

fs.writeFileSync(path, content, 'utf8');
console.log('Restored editable diagnosis, treatment, and referral dropdown');
