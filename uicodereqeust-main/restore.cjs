const fs = require('fs');

const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetRegex = /<p className="font-semibold text-amber-800 mt-1">\s*Please select a new referred hospital in the section below and click "Reassign Referral" to route it to another facility\.[\s\S]*?(?=\{\/\* Tab 1 footer: Close \+ Next \*\/})/;

const replacement = `<p className="font-semibold text-amber-800 mt-1">
                  Please select a new referred hospital in the section below and click "Reassign Referral" to route it to another facility.
                </p>
              </div>
            </div>
          )}

          {/* Success template overlays after approval/decline */}
          {actions.approvalResult || actions.declineResult ? (
            <PostReviewTemplates
              request={request}
              approvalResult={actions.approvalResult}
              declineResult={actions.declineResult}
              copyApprovalMessage={actions.copyApprovalMessage}
              copyDeclineMessage={actions.copyDeclineMessage}
              setApprovalResult={actions.setApprovalResult}
              setDeclineResult={actions.setDeclineResult}
              onClose={onClose}
              allowDelete={allowDelete}
              setDeleteConfirmOpen={actions.setDeleteConfirmOpen}
              processing={actions.processing}
              editReferralHospitalName={actions.editReferralHospitalName}
              nurseDisplayName={actions.nurseDisplayName}
              nurseInitials={actions.nurseInitials}
            />
          ) : (
            <>
              {/* ─── Tab 1: Patient Verify & History ─── */}
              <TabsContent value="verification" className="space-y-4 mt-0">
                {/* Patient registry NHIS verify card */}
                <PatientVerifyCard
                  request={request}
                  checking={verification.checking}
                  patientMatchStatus={verification.patientMatchStatus}
                  matchedMemberId={verification.matchedMemberId}
                  policyVerified={verification.policyVerified}
                  nhisVerified={verification.nhisVerified}
                  familyMembers={verification.familyMembers}
                  earlyRefill={verification.earlyRefill}
                  requestPatientName={requestPatientName}
                  requestPolicyNumber={requestPolicyNumber}
                  primaryHospitalLoading={primaryHospitalLoading}
                  primaryHospital={primaryHospital}
                  primaryHospitalMismatch={primaryHospitalMismatch}
                  requestingHospitalName={requestingHospitalName}
                  requestingHospitalCode={requestingHospitalCode}
                />

                {/* Local and spreadsheet claims history */}
                <ClinicalHistory
                  request={request}
                  visibleHistory={visibleHistory}
                  historyPage={historyPage}
                  setHistoryPage={setHistoryPage}
                  requestPatientName={requestPatientName}
                  requestPolicyNumber={requestPolicyNumber}
                />

                `;

content = content.replace(targetRegex, replacement);
fs.writeFileSync(path, content, 'utf8');
console.log('Restored correctly');
