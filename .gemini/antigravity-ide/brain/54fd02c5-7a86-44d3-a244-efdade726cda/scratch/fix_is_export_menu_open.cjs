const fs = require('fs');
const path = 'c:/Users/PLPASIG/Documents/Github/PLPass/src/features/organizer/pages/EventRecordsPage.tsx';

let content = fs.readFileSync(path, 'utf8');

const targetIndex = content.indexOf('<div ref={exportMenuRef} className="relative">');
if (targetIndex === -1) {
  console.error("targetIndex not found!");
  process.exit(1);
}

const endIndex = content.indexOf('</div>\n            </div>\n          </div>\n          <div className="mt-4 border-t pt-4">');

if (endIndex === -1) {
  console.error("endIndex not found!");
  // Try alternative line endings
  const altEndIndex = content.indexOf('</div>\r\n            </div>\r\n          </div>\r\n          <div className="mt-4 border-t pt-4">');
  if (altEndIndex === -1) {
    console.error("altEndIndex not found!");
    process.exit(1);
  }
}

const before = content.slice(0, targetIndex);
const after = content.slice(content.indexOf('</div>\n            </div>\n          </div>\n          <div className="mt-4 border-t pt-4">'));

const replacement = `<Button
                type="button"
                variant="default"
                size="sm"
                className="border-primary bg-primary text-white hover:bg-primary/90 shadow-xs"
                onClick={() => setIsExportModalOpen(true)}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </Button>\n            `;

content = before + replacement + after;

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully removed old isExportMenuOpen block from EventRecordsPage.tsx');
