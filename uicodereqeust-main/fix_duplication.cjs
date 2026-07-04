const fs = require('fs');

const path = 'src/components/dashboard/ReviewModal.tsx';
let content = fs.readFileSync(path, 'utf8');

const startIndex = content.indexOf('// Custom Hooks');
// We want to delete from the start of line 218 to the second `const allowDelete` line.
if (startIndex !== -1) {
  const endIndexString = 'const allowDelete = canDeleteRequestRecord(request);';
  const endIndex = content.indexOf(endIndexString, startIndex);
  if (endIndex !== -1) {
    const stringToRemove = content.substring(startIndex, endIndex + endIndexString.length);
    content = content.replace(stringToRemove, "");
    fs.writeFileSync(path, content, 'utf8');
    console.log("Fixed duplication!");
  } else {
    console.log("Could not find end index");
  }
} else {
  console.log("Could not find start index");
}
