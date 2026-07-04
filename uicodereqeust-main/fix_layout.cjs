const fs = require('fs');

const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\{\/\* Modal body container \*\/\}\s*<div className="p-3 sm:p-5 space-y-4">\s*\{\/\* Locked status warning \*\/\}\s*\{request\?\.deletion_status === "awaiting_admin_approval" && \(\s*<div className="p-4 rounded-2xl text-xs border bg-rose-50 border-rose-250 flex items-center gap-3 text-rose-900 shadow-xs animate-in fade-in duration-350">\s*<AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" \/>\s*<div>/m;

// wait, the diff shows it deleted up to <div> inside the locked status warning.
// let's just do a string replace for what we know is broken.

// We need to restore:
//         {/* Modal body container (Scrollable) */}
//         <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4">
//           {/* Locked status warning */}
//           {request?.deletion_status === "awaiting_admin_approval" && (
//             <div className="p-4 rounded-2xl text-xs border bg-rose-50 border-rose-250 flex items-center gap-3 text-rose-900 shadow-xs animate-in fade-in duration-350">
//               <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
//               <div>

const brokenRegex = /<p className="font-black uppercase tracking-wider text-xs text-rose-800">Awaiting Deletion Approval<\/p>/;
content = content.replace(brokenRegex, `        {/* Modal body container (Scrollable) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4">
          {/* Locked status warning */}
          {request?.deletion_status === "awaiting_admin_approval" && (
            <div className="p-4 rounded-2xl text-xs border bg-rose-50 border-rose-250 flex items-center gap-3 text-rose-900 shadow-xs animate-in fade-in duration-350">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wider text-xs text-rose-800">Awaiting Deletion Approval</p>`);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed broken body container');
