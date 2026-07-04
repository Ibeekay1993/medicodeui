const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace Diagnosis Card and Decision section styles to match PatientVerifyCard

// 1. Proposed Diagnosis label
content = content.replace(
  `className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2"`,
  `className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2"`
);

// 2. Proposed Treatment label
content = content.replace(
  `className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2 pt-2 border-t border-slate-100"`,
  `className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2 pt-2 border-t border-slate-100"`
);

// 3. Textareas in Diagnosis card
content = content.replace(
  /className="w-full p-3 border border-slate-200 rounded-xl text-\[14px\] font-bold text-slate-800 bg-white min-h-\[70px\] focus:outline-none focus:ring-2 focus:ring-blue-500"/g,
  `className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[70px] focus:outline-none focus:ring-2 focus:ring-blue-500"`
);

content = content.replace(
  /className="w-full p-3 border border-slate-200 rounded-xl text-\[14px\] font-semibold text-slate-800 bg-white min-h-\[90px\] focus:outline-none focus:ring-2 focus:ring-blue-500"/g,
  `className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[90px] focus:outline-none focus:ring-2 focus:ring-blue-500"`
);

// 4. Referral Hospital label
content = content.replace(
  `className="text-xs font-black uppercase tracking-widest text-slate-700"`,
  `className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide"`
);
content = content.replace(
  `className="mt-0.5 text-xs font-semibold text-slate-500"`,
  `className="mt-1 text-[11px] sm:text-[12px] text-slate-400"`
);

// 5. Referral container background
content = content.replace(
  `className="space-y-3.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm mt-3"`,
  `className="space-y-3.5 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3 mt-3"`
);

// 6. Requesting hospital label
content = content.replace(
  `className="text-[10px] uppercase font-black text-slate-400 tracking-wider"`,
  `className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide"`
);
content = content.replace(
  `className="text-[10px] uppercase font-black text-slate-400 tracking-wider"`,
  `className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide"`
);

// 7. Requesting hospital value
content = content.replace(
  `className="text-[12px] font-bold text-slate-800 truncate"`,
  `className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1 truncate"`
);

// 8. Decision label
content = content.replace(
  `className="text-[12px] font-extrabold text-slate-800 uppercase mb-2"`,
  `className="text-[13px] sm:text-[14px] font-extrabold text-slate-800 uppercase tracking-wide mb-3"`
);

// 9. Decision textarea
content = content.replace(
  `className="w-full p-3.5 border border-slate-200 rounded-xl text-[14px] text-slate-800 bg-white min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"`,
  `className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Restyled ReviewModal fields');
