const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix the Tabs min-h-0 scrolling issue
content = content.replace(
  /<Tabs value=\{activeTab\} onValueChange=\{setActiveTab as any\} className="flex flex-col h-full w-full">/,
  '<Tabs value={activeTab} onValueChange={setActiveTab as any} className="flex flex-col h-full w-full min-h-0">'
);

// Add min-h-0 to the scrollable container as well
content = content.replace(
  /<div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4">/,
  '<div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4 min-h-0">'
);

// Apply precise design changes from the user's HTML:
// The process tracker should match exactly.
const newProcessTracker = `{/* Process Tracker */}
          {request?.referred_hospital_name ? (
            <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2">
              <div className="flex flex-col items-center gap-1">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_referral"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["pending_referral"].includes(request.status) ? "text-slate-800" : "text-slate-800")}>Referral</span>
              </div>
              <div className="w-6 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral"].includes(request.status) ? "bg-slate-300" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["referral_approved"].includes(request.status) ? "text-slate-800" : ["pending_referral"].includes(request.status) ? "text-slate-400" : "text-slate-800")}>Insurer</span>
              </div>
              <div className="w-6 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_accepted"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "bg-slate-300" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["referral_accepted"].includes(request.status) ? "text-slate-800" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "text-slate-400" : "text-slate-800")}>Hospital</span>
              </div>
              <div className="w-6 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_authorization"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "bg-slate-300" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["pending_authorization"].includes(request.status) ? "text-slate-800" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "text-slate-400" : "text-slate-800")}>Review</span>
              </div>
              <div className="w-6 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["approved", "authorization_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-300")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["approved", "authorization_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Authorized</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-[3px] border-slate-800" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-800">Verify</span>
              </div>
              <div className="w-8 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Review</span>
              </div>
              <div className="w-8 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Decision</span>
              </div>
            </div>
          )}`;

const oldProcessTrackerRegex = /\{\/\* Process Tracker \*\/\}[\s\S]*?(?=\{\/\* TabsList \*\/\})/m;
content = content.replace(oldProcessTrackerRegex, newProcessTracker + '\n\n          ');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed scrolling min-h-0 and process tracker');
