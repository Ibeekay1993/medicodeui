const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Change DialogContent to be overflow-y-auto and not flex-col restricted
content = content.replace(
  /DialogContent className="w-\[94vw\].*?overflow-hidden"/,
  'DialogContent className="w-[94vw] max-w-[94vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[92dvh] rounded-[1.5rem] sm:rounded-[2rem] border-0 bg-white/95 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white to-slate-50/50 backdrop-blur-2xl selection:bg-slate-200 p-0 shadow-[0_8px_40px_rgb(0,0,0,0.08)] ring-1 ring-slate-200 overflow-y-auto"'
);

// 2. Remove flex flex-col h-full w-full min-h-0 from Tabs
content = content.replace(
  /<Tabs value=\{activeTab\} onValueChange=\{setActiveTab as any\} className="flex flex-col h-full w-full min-h-0">/,
  '<Tabs value={activeTab} onValueChange={setActiveTab as any} className="w-full">'
);

// 3. Remove shrink-0 and sticky stuff from the header div
content = content.replace(
  /<div className="shrink-0 z-30 px-5 pt-4 pb-2 border-b border-slate-100 bg-white\/80 backdrop-blur-xl">/,
  '<div className="px-5 pt-4 pb-2">'
);

// 4. Remove flex-1 overflow-y-auto min-h-0 from the scrollable body container
content = content.replace(
  /<div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4 min-h-0">/,
  '<div className="p-3 sm:p-5 space-y-4">'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Removed sticky header, made whole modal scrollable');
