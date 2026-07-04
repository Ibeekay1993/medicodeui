const fs = require('fs');
const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the formData.auditNote with a local state in the component, or just mock it since we only care about editDecisionNote for now.
// Wait, the best way is to just use editDecisionNote for the reason, and ignore auditNote if not needed.
// Even better, I'll replace the textareas to use actions.editDecisionNote for the reason.
content = content.replace(/value=\{actions\.formData\.auditNote\}/g, 'defaultValue=""');
content = content.replace(/onChange=\{\(e\) => actions\.setFormData\(\{ \.\.\.actions\.formData, auditNote: e\.target\.value \}\)\}/g, '');

content = content.replace(/value=\{actions\.formData\.reason\}/g, 'value={actions.editDecisionNote}');
content = content.replace(/onChange=\{\(e\) => actions\.setFormData\(\{ \.\.\.actions\.formData, reason: e\.target\.value \}\)\}/g, 'onChange={(e) => actions.setEditDecisionNote(e.target.value)}');

content = content.replace(/onClick=\{\(\) => actions\.handleAction\("decline"\)\}/g, 'onClick={() => actions.handleDecline(actions.editDecisionNote)}');
content = content.replace(/!actions\.formData\.reason/g, '!actions.editDecisionNote');

content = content.replace(/onClick=\{\(\) => actions\.handleAction\("approve"\)\}/g, 'onClick={actions.handleApprove}');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed clinical tab methods and state');
