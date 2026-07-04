const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';

let content = fs.readFileSync(path, 'utf8');

// 1. Wrap DialogContent contents in Tabs
content = content.replace(
  '<DialogContent className="w-[94vw] max-w-[94vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[92dvh] overflow-y-auto overflow-x-hidden rounded-[1.5rem] sm:rounded-[2rem] border-0 bg-white/95 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white to-slate-50/50 backdrop-blur-2xl selection:bg-slate-200 p-0 shadow-[0_8px_40px_rgb(0,0,0,0.08)] ring-1 ring-slate-200">',
  `<DialogContent className="w-[94vw] max-w-[94vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[92dvh] overflow-y-auto overflow-x-hidden rounded-[1.5rem] sm:rounded-[2rem] border-0 bg-white/95 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white to-slate-50/50 backdrop-blur-2xl selection:bg-slate-200 p-0 shadow-[0_8px_40px_rgb(0,0,0,0.08)] ring-1 ring-slate-200">
        <Tabs value={activeTab} onValueChange={setActiveTab as any} className="flex flex-col min-h-full w-full">`
);

// 2. We need to add TabsList and Process Tracker to the sticky header.
// The sticky header currently ends at:
//             </div>
//           </div>
//         </div>
//
//         {/* Modal body container */}
// Let's replace the Process Tracker and the original TabsList.

const headerEndRegex = /            <\/div>\n          <\/div>\n        <\/div>\n\n        \{\/\* Modal body container \*\/\}/;

const processTrackerReplacement = `
            {/* Dot Process Tracker */}
            {request?.referred_hospital_name ? (
              <div className="flex flex-row items-center justify-center w-full max-w-sm mx-auto pt-2 pb-1 relative mt-2">
                <div className="absolute top-[35%] left-[5%] w-[90%] h-[1px] bg-slate-200 z-0" />
                <div className="flex justify-between w-full relative z-10">
                  <div className="flex flex-col items-center gap-1.5 bg-transparent">
                    <div className={cn("rounded-full z-10", ["pending_referral"].includes(request.status) ? "w-3 h-3 border-2 border-slate-700 bg-white" : "w-2 h-2 bg-slate-700")} />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Referral</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 bg-transparent">
                    <div className={cn("rounded-full z-10", ["referral_approved"].includes(request.status) ? "w-3 h-3 border-2 border-slate-700 bg-white" : ["pending_referral"].includes(request.status) ? "w-2 h-2 bg-slate-200" : "w-2 h-2 bg-slate-700")} />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Insurer</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 bg-transparent">
                    <div className={cn("rounded-full z-10", ["referral_accepted"].includes(request.status) ? "w-3 h-3 border-2 border-slate-700 bg-white" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "w-2 h-2 bg-slate-200" : "w-2 h-2 bg-slate-700")} />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Hospital</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 bg-transparent">
                    <div className={cn("rounded-full z-10", ["pending_authorization"].includes(request.status) ? "w-3 h-3 border-2 border-slate-700 bg-white" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "w-2 h-2 bg-slate-200" : "w-2 h-2 bg-slate-700")} />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Review</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 bg-transparent">
                    <div className={cn("rounded-full z-10", ["approved", "authorization_approved"].includes(request.status) ? "w-3 h-3 border-2 border-emerald-500 bg-white" : "w-2 h-2 bg-slate-200")} />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Authorized</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-row items-center justify-center w-full max-w-xs mx-auto pt-2 pb-1 relative mt-2">
                <div className="absolute top-[35%] left-[10%] w-[80%] h-[1px] bg-slate-200 z-0" />
                <div className="flex justify-between w-full relative z-10">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-700 z-10" />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Verify</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-300 z-10" />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Review</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-300 z-10" />
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 bg-white/50 px-1">Decision</span>
                  </div>
                </div>
              </div>
            )}

            <TabsList className="grid w-full grid-cols-2 h-[42px] sm:h-12 rounded-xl bg-slate-100/80 p-1 gap-1 mt-4">
              <TabsTrigger
                value="verification"
                className="rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md transition-all h-full"
              >
                Patient Verify & History
              </TabsTrigger>
              <TabsTrigger
                value="clinical"
                className="rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md transition-all h-full"
              >
                Clinical Review
              </TabsTrigger>
            </TabsList>
            
          </div>
        </div>

        {/* Modal body container */}`;

content = content.replace(headerEndRegex, processTrackerReplacement);

// 3. Remove the old Process Tracker and old Tabs from the body
// The old process tracker starts with {/* Process Tracker (Moved out of sticky header) */}
// and ends right before {/* Locked status warning */}

const oldProcessTrackerRegex = /\{\/\* Process Tracker \(Moved out of sticky header\) \*\/\}[\s\S]*?(?=\{\/\* Locked status warning \*\/\})/;
content = content.replace(oldProcessTrackerRegex, '');

// 4. Remove the old Tabs wrap and old TabsList
// It looks like:
//             /* Tabbed Clinical Review Layout */
//             <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
//               <TabsList className="grid w-full grid-cols-2 h-11 sm:h-12 rounded-xl bg-slate-100 p-1 gap-1">
//                 ...
//               </TabsList>
const oldTabsListRegex = /\/\* Tabbed Clinical Review Layout \*\/\s*<Tabs value=\{activeTab\} onValueChange=\{setActiveTab\} className="space-y-4">\s*<TabsList[\s\S]*?<\/TabsList>/;
content = content.replace(oldTabsListRegex, '{/* Tabbed Clinical Review Layout */}');

// 5. Close the Tabs component at the very end instead of DialogContent directly
// Near the bottom:
//               </TabsContent>
//             </Tabs>
//           )}
//         </div>
//       </DialogContent>
// Wait, we need to change:
//               </TabsContent>
//             </Tabs>
// to just 
//               </TabsContent>
// because we wrap everything in Tabs at the top!
// Actually, let's find the closing Tabs tag inside the else branch of the templates.
const oldClosingTabsRegex = /<\/TabsContent>\s*<\/Tabs>\s*\)\}\s*<\/div>\s*<\/DialogContent>/;
content = content.replace(oldClosingTabsRegex, '</TabsContent>\n          )}\n        </div>\n        </Tabs>\n      </DialogContent>');

fs.writeFileSync(path, content, 'utf8');
console.log('Refactored ReviewModal.tsx');
