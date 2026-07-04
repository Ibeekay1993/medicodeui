const fs = require('fs');

const path = 'src/components/dashboard/review/PatientVerifyCard.tsx';
let content = fs.readFileSync(path, 'utf8');

// The write_to_file call included backslashes before backticks because I mistakenly escaped them.
// Let's replace \` with ` and \$ with $ where they shouldn't have backslashes.

content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed backticks');
