const { execSync } = require('child_process');
const fs = require('fs');
const out = execSync('git show HEAD~3:./src/components/dashboard/ReviewModal.tsx').toString();
fs.writeFileSync('old_modal_utf8.tsx', out, 'utf8');
