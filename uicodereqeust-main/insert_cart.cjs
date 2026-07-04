const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const cartInsertion = `
                <div className="bg-white rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-100 shadow-sm p-4 sm:p-5 relative overflow-hidden group mb-3">
                  {/* Treatment Cart Component */}
                  <TreatmentCart
                    request={request}
                    approvedItems={tariffSearch.approvedItems}
                    removeApprovedItem={tariffSearch.removeApprovedItem}
                    updateApprovedItem={tariffSearch.updateApprovedItem}
                    totalApprovedAmount={tariffSearch.approvedTotal}
                    role={role}
                    isHmo={role !== "hospital"}
                    editTreatment={actions.editTreatment}
                    setEditTreatment={actions.setEditTreatment}
                    updateDeclineReason={tariffSearch.updateDeclineReason}
                    tariffSearch={tariffSearch.tariffSearch}
                    setTariffSearch={tariffSearch.setTariffSearch}
                    tariffOptions={tariffSearch.tariffOptions}
                    setTariffOptions={tariffSearch.setTariffOptions}
                    tariffSearchLoading={tariffSearch.tariffSearchLoading}
                    addApprovedItem={tariffSearch.addApprovedItem}
                    cartCollapsed={tariffSearch.cartCollapsed}
                    setCartCollapsed={tariffSearch.setCartCollapsed}
                  />
                </div>
`;

content = content.replace('{/* Decision Section */}', cartInsertion + '\n                {/* Decision Section */}');

fs.writeFileSync(path, content, 'utf8');
console.log('Inserted TreatmentCart');
