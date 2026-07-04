const fs = require('fs');

function restyleReviewModal() {
  const path = 'src/components/dashboard/ReviewModal.tsx';
  let content = fs.readFileSync(path, 'utf8');

  // 1. Diagnosis 'Referral' pill
  content = content.replace(
    /className="bg-blue-100 text-blue-700 px-1\.5 py-0\.5 rounded text-\[9px\] uppercase font-bold tracking-widest"/g,
    `className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest"`
  );

  // 2. Treatment 'Referred Hospital' pill
  content = content.replace(
    /className="bg-emerald-100 text-emerald-700 px-1\.5 py-0\.5 rounded text-\[9px\] uppercase font-bold tracking-widest"/g,
    `className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest"`
  );

  // 3. Referral Hospital / Claim Owner inner blocks
  content = content.replace(
    /className="rounded-xl border border-slate-200 bg-slate-50 px-3\.5 py-2\.5 text-xs font-bold leading-relaxed text-slate-700 shadow-sm"/g,
    `className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-[11px] sm:text-[12px] font-bold leading-relaxed text-slate-500 shadow-sm"`
  );

  content = content.replace(
    /className="rounded-xl border border-slate-100 bg-slate-50\/50 px-3 py-2 text-xs font-semibold text-slate-500"/g,
    `className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] sm:text-[12px] font-semibold text-slate-400"`
  );

  fs.writeFileSync(path, content, 'utf8');
}

function restyleTreatmentCart() {
  const path = 'src/components/dashboard/review/TreatmentCart.tsx';
  if (!fs.existsSync(path)) return;
  let content = fs.readFileSync(path, 'utf8');

  // Treatment Cart header
  content = content.replace(
    /className="text-\[12px\] font-extrabold text-slate-800 uppercase"/g,
    `className="text-[11px] sm:text-[12px] font-extrabold text-slate-800 uppercase tracking-wide"`
  );
  
  // Treatment Cart description
  content = content.replace(
    /className="text-\[11px\] font-semibold text-slate-400 mt-0\.5"/g,
    `className="text-[11px] sm:text-[12px] font-semibold text-slate-400 mt-1"`
  );

  // Treatment Cart Items background
  content = content.replace(
    /className="bg-slate-50 rounded-xl p-3 border border-slate-100 relative group"/g,
    `className="bg-white rounded-xl p-3 border border-slate-100 relative group shadow-sm"`
  );
  // Wait, if the outer container is white, the items should be slate-50.
  // The ReviewModal wrapper for TreatmentCart is:
  // <div className="bg-white rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-100 shadow-sm p-4 sm:p-5 relative overflow-hidden group mb-3">
  // So inside, the items should indeed be bg-slate-50!
  
  // Let's replace the outer wrapper of the add item section if it's too harsh
  content = content.replace(
    /className="bg-slate-50 p-4 border-t border-slate-100 rounded-b-\[1.5rem\]"/g,
    `className="bg-slate-50 p-4 rounded-xl mt-3 border border-slate-100"`
  );

  // Total Approved Amount
  content = content.replace(
    /className="text-\[12px\] font-extrabold text-slate-800 uppercase tracking-wide"/g,
    `className="text-[11px] sm:text-[12px] font-extrabold text-slate-500 uppercase tracking-wide"`
  );

  fs.writeFileSync(path, content, 'utf8');
}

restyleReviewModal();
restyleTreatmentCart();
console.log('Restyled tags and Treatment Cart');
