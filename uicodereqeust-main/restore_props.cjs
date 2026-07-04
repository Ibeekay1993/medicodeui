const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const hospitalPriorityBlock = `
                  <div className="flex gap-4 items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        Requesting Hospital
                      </span>
                      <p className="text-[12px] font-bold text-slate-800 truncate">
                        {request.hospital_name || "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1 text-right shrink-0">
                      <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        Priority
                      </span>
                      <div>
                        <Badge
                          variant={request.urgency === "urgent" ? "destructive" : "outline"}
                          className="px-2 py-0.5 rounded-md uppercase text-[10px] font-black border-slate-200"
                        >
                          {request.urgency || "ROUTINE"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>`;

content = content.replace('                  </div>\n                </div>\n\n                <div className="bg-white rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-100 shadow-sm p-4 sm:p-5 relative overflow-hidden group mb-3">', hospitalPriorityBlock + '\n\n                <div className="bg-white rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-100 shadow-sm p-4 sm:p-5 relative overflow-hidden group mb-3">');


const missingCartProps = `                    parseLoading={tariffSearch.parseLoading}
                    parseStatus={tariffSearch.parseStatus}
                    parseTreatmentText={tariffSearch.parseTreatmentText}
                    editingQuantities={tariffSearch.editingQuantities}
                    updateApprovedItemQuantity={tariffSearch.updateApprovedItemQuantity}
                    commitQuantity={tariffSearch.commitQuantity}
                    toggleDeclineApprovedItem={tariffSearch.toggleDeclineApprovedItem}`;

content = content.replace('                    addApprovedItem={tariffSearch.addApprovedItem}', missingCartProps + '\n                    addApprovedItem={tariffSearch.addApprovedItem}');

fs.writeFileSync(path, content, 'utf8');
console.log('Restored Hospital Priority Block and Cart Props');
