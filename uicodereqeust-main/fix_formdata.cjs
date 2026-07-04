const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/value=\{formData\.auditNote\}/g, 'value={actions.formData.auditNote}');
content = content.replace(/value=\{formData\.reason\}/g, 'value={actions.formData.reason}');
content = content.replace(/\.\.\.formData/g, '...actions.formData');
content = content.replace(/!formData\.reason/g, '!actions.formData.reason');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed formData reference error');
