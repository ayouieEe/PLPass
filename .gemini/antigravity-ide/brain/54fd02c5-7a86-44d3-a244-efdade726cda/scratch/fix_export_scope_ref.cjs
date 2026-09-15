const fs = require('fs');
const path = 'c:/Users/PLPASIG/Documents/Github/PLPass/src/features/organizer/pages/EventRecordsPage.tsx';

let content = fs.readFileSync(path, 'utf8');

const target = `  const exportEvents = exportScope === "all" ? completedRows : pastEvents;\n`;
const altTarget = `  const exportEvents = exportScope === "all" ? completedRows : pastEvents;\r\n`;

if (content.includes(target)) {
  content = content.replace(target, '');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Removed exportEvents (LF)');
} else if (content.includes(altTarget)) {
  content = content.replace(altTarget, '');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Removed exportEvents (CRLF)');
} else {
  console.error('Target not found!');
}
