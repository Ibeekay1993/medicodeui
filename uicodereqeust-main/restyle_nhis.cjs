const fs = require('fs');
const path = 'src/components/dashboard/review/PatientVerifyCard.tsx';
let content = fs.readFileSync(path, 'utf8');

const updatedNhisBlock = `      {/* NHIS Confirmation */}
      <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-sm transition-all">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className={\`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[12px] font-bold \${
              checking ? "border-slate-300 text-slate-400" :
              policyVerified && patientMatchStatus === "exact" ? "border-green-500 text-green-500" :
              policyVerified ? "border-yellow-500 text-yellow-500" :
              "border-red-500 text-red-500"
            }\`}>
              {checking ? "â—Œ" : policyVerified && patientMatchStatus === "exact" ? "âœ“" : "!"}
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-slate-800">NHIS Confirmation</div>
              <div className={\`text-[11px] \${!policyVerified && !checking ? 'text-red-500 font-bold' : 'text-slate-400'}\`}>
                {checking ? "Checking registry..." :
                 policyVerified && patientMatchStatus === "exact" ? "Verified master records registry" :
                 policyVerified ? "Partial match in registry" :
                 "Not found in registry"}
              </div>
            </div>
          </div>
          <div 
            className="bg-slate-100 px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-500 flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-colors"
            onClick={() => setShowFamily(!showFamily)}
          >
            {familyMembers.length || 0} FAMILY MEMBERS {showFamily ? 'â–´' : 'â–¾'}
          </div>
        </div>

        {showFamily && (
          <div className="mt-3 border-t border-slate-100 pt-3 animate-in fade-in duration-200">
            <div className={\`flex items-start gap-2 p-3 rounded-xl mb-2 border \${policyVerified ? 'bg-slate-50 border-slate-100' : 'bg-red-50 border-red-100'}\`}>
              <div className={\`text-[16px] mt-0.5 \${policyVerified ? 'text-green-500' : 'text-red-500'}\`}>
                {policyVerified ? "âœ“" : "âœ—"}
              </div>
              <div>
                <strong className={\`text-[12px] sm:text-[13px] block \${policyVerified ? 'text-slate-800' : 'text-red-800'}\`}>
                  {policyVerified ? "Policy number matched:" : "Policy number NOT found:"}
                </strong>
                <p className={\`text-[11px] sm:text-[12px] mt-0.5 \${policyVerified ? 'text-slate-500' : 'text-red-600'}\`}>
                  {policyVerified ? "Exact policy found in monthly NHIS Accredited List." : "This policy number is not in the active NHIS registry."}
                </p>
              </div>
            </div>

            <div className={\`flex items-start gap-2 p-3 rounded-xl mb-2 border \${patientMatchStatus === 'exact' ? 'bg-slate-50 border-slate-100' : patientMatchStatus === 'partial' ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}\`}>
              <div className={\`text-[16px] mt-0.5 \${patientMatchStatus === 'exact' ? 'text-green-500' : patientMatchStatus === 'partial' ? 'text-yellow-500' : 'text-red-500'}\`}>
                {patientMatchStatus === 'exact' ? "âœ“" : "!"}
              </div>
              <div>
                <strong className={\`text-[12px] sm:text-[13px] block \${patientMatchStatus === 'exact' ? 'text-slate-800' : patientMatchStatus === 'partial' ? 'text-yellow-800' : 'text-red-800'}\`}>
                  {patientMatchStatus === 'exact' ? "Patient name matched exactly:" : patientMatchStatus === 'partial' ? "Patient name partial match:" : "Patient name mismatch:"}
                </strong>
                <p className={\`text-[11px] sm:text-[12px] mt-0.5 \${patientMatchStatus === 'exact' ? 'text-slate-500' : patientMatchStatus === 'partial' ? 'text-yellow-700' : 'text-red-600'}\`}>
                  {patientMatchStatus === 'exact' ? "Name matches principal/dependent records." : patientMatchStatus === 'partial' ? "Name is similar but not an exact match." : "Name does not match any records for this policy."}
                </p>
              </div>
            </div>

            <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide my-3 px-1">
              Policy Family Tree
            </div>
            
            {familyMembers.length > 0 ? (
              familyMembers.map((member, idx) => {
                const isMatch = member.id === matchedMemberId || member.full_name === requestPatientName;
                return (
                  <div key={idx} className={\`flex items-center justify-between p-3 rounded-xl mb-2 border transition-all \${isMatch ? 'bg-green-50 border-green-500 border-2 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}\`}>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className={\`px-2 py-0.5 rounded text-[9px] font-bold uppercase inline-block mb-1 \${isMatch ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-500'}\`}>
                          {member.relationship || "Member"}
                        </div>
                        <div className="text-[13px] sm:text-[14px] font-bold text-slate-800">
                          {member.full_name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                          {member.phone || "NO PHONE"}
                        </div>
                      </div>
                    </div>
                    {isMatch && (
                      <div className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <span className="text-[12px]">âœ“</span> Matched
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-[12px] font-semibold text-slate-400 p-4 bg-slate-50 rounded-xl text-center border border-slate-100 border-dashed">
                No family members found for this policy.
              </div>
            )}
          </div>
        )}
      </div>`;

// Replace from {/* NHIS Confirmation */} to the end of the div
const nhisRegex = /\{\/\* NHIS Confirmation \*\/\}.*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/s;
// The regex needs to be careful about counting divs.
// I will just replace from `{/* NHIS Confirmation */}` up to `</div>\n    </div>\n  );\n}`
const blockRegex = /\{\/\* NHIS Confirmation \*\/\}.*?<\/div>\s*<\/div>\s*\n\s*<\/div>\s*\n\s*\);\n}/s;

let newContent = content.replace(blockRegex, updatedNhisBlock + '\n    </div>\n  );\n}');
if (newContent === content) {
  // Try fallback string replace
  const startIdx = content.indexOf('{/* NHIS Confirmation */}');
  const endIdx = content.indexOf('</form>', startIdx) > -1 ? content.indexOf('</form>', startIdx) : content.lastIndexOf('</div>\n  );\n}');
  if (startIdx > -1) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx);
    newContent = before + updatedNhisBlock + after;
  }
}

fs.writeFileSync(path, newContent, 'utf8');
console.log('Restructured NHIS Confirmation');
