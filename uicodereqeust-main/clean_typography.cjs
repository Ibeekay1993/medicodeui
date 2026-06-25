const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const classMap = {
  'text-[7px]': 'text-xs',
  'text-[8px]': 'text-xs',
  'text-[9px]': 'text-xs',
  'text-[10px]': 'text-xs',
  'text-[11px]': 'text-xs',
  'text-[12px]': 'text-xs',
  'text-[13px]': 'text-sm',
  'text-[14px]': 'text-sm',
  'text-[15px]': 'text-sm',
  'text-[16px]': 'text-base',
  'text-[17px]': 'text-lg',
  'text-[18px]': 'text-lg',
  'text-[20px]': 'text-xl',
};

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      // Replace text-[Xpx]
      const regex = /text-\[\d+px\]/g;
      content = content.replace(regex, (match) => {
        if (classMap[match]) {
          changed = true;
          return classMap[match];
        }
        return match;
      });

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated typography in ${fullPath}`);
      }
    }
  }
}

processDirectory(srcDir);
console.log("Typography standardization complete.");
