const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the clinical tab content with the user's exact design
const newClinicalTab = `<TabsContent value="clinical" className="space-y-4 mt-0">
                {/* Referral Banner */}
                <div className="bg-blue-50 rounded-2xl p-4 flex gap-3 items-start mb-4 border border-blue-100">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 text-[18px] font-bold shrink-0">
                    ℹ
                  </div>
                  <div>
                    <div className="text-[14px] font-extrabold text-blue-900">
                      Referral Request from {requestingHospitalName || "Unknown Hospital"}
                    </div>
                    <div className="text-[12px] text-blue-500 mt-1 leading-relaxed">
                      {request?.clinical_notes || "Patient referred for further clinical evaluation and management."}
                    </div>
                  </div>
                </div>

                {/* Diagnosis Card */}
                <div className="bg-white rounded-2xl p-4 border border-slate-100 mb-3 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide">
                      Proposed Diagnosis
                    </div>
                    <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[9px] font-bold text-slate-500 tracking-wide">
                      {request?.diagnosis_code || "ICD-10"}
                    </div>
                  </div>
                  <div className="text-[18px] font-extrabold text-slate-800 mb-3">
                    {request?.diagnosis || "Not specified"}
                  </div>
                  <textarea 
                    className="w-full p-3 border border-slate-200 rounded-xl text-[13px] text-slate-800 bg-slate-50 min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Add clinical review notes..."
                    value={formData.auditNote}
                    onChange={(e) => actions.setFormData({ ...formData, auditNote: e.target.value })}
                  />
                </div>

                {/* Decision Section */}
                <div className="mt-4 mb-2">
                  <div className="text-[12px] font-extrabold text-slate-800 uppercase mb-2">
                    Review Decision <span className="text-red-500">*</span>
                    <span className="text-[11px] text-slate-400 font-normal float-right lowercase normal-case">required</span>
                  </div>
                  <textarea 
                    className="w-full p-3.5 border border-slate-200 rounded-xl text-[14px] text-slate-800 bg-white min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2" 
                    placeholder="Enter reason for approval or decline..."
                    value={formData.reason}
                    onChange={(e) => actions.setFormData({ ...formData, reason: e.target.value })}
                  />
                </div>

                {/* Tab 2 footer: Close + Decline + Approve */}
                <div className="flex items-center gap-2 pt-3 sm:pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    className="h-11 sm:h-12 px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex-shrink-0 min-w-[100px]"
                    onClick={onClose}
                  >
                    Close
                  </Button>
                  <Button
                    className="h-11 sm:h-12 flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                    onClick={() => actions.handleAction("decline")}
                    disabled={actions.processing || !formData.reason}
                  >
                    {actions.processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Decline"}
                  </Button>
                  <Button
                    className="h-11 sm:h-12 flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                    onClick={() => actions.handleAction("approve")}
                    disabled={actions.processing}
                  >
                    {actions.processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
                  </Button>
                </div>
              </TabsContent>`;

const oldClinicalTabRegex = /<TabsContent value="clinical" className="space-y-4 mt-0">[\s\S]*?<\/TabsContent>/;
content = content.replace(oldClinicalTabRegex, newClinicalTab);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed clinical tab layout');
