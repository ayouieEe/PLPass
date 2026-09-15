const ExcelJS = require("exceljs");
const fs = require("fs");

async function test() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Test Sheet");

  worksheet.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  function safeMerge(ws, startRow, startCol, endRow, endCol) {
    if (startRow === endRow && startCol === endCol) return;
    if (endRow < startRow || endCol < startCol) return;
    ws.mergeCells(startRow, startCol, endRow, endCol);
  }

  const maxWidthCols = 9;
  for (let row = 1; row <= 5; row++) safeMerge(worksheet, row, 1, row, maxWidthCols);

  worksheet.getCell(1, 1).value = "PAMANTASAN NG LUNGSOD NG PASIG";

  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const logoId = workbook.addImage({ base64: dummyPng, extension: "png" });

  console.log("Adding logo A1:A3...");
  worksheet.addImage(logoId, "A1:A3");

  const lastColChar = String.fromCharCode(64 + Math.max(maxWidthCols, 1));
  console.log(`Adding custom logo ${lastColChar}1:${lastColChar}3...`);
  worksheet.addImage(logoId, `${lastColChar}1:${lastColChar}3`);

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync("test_out.xlsx", Buffer.from(buffer));
  console.log("Wrote test_out.xlsx, size:", buffer.byteLength);

  const readWb = new ExcelJS.Workbook();
  await readWb.xlsx.readFile("test_out.xlsx");
  console.log("Successfully read back test_out.xlsx!");
}

test().catch(err => console.error("TEST ERROR:", err));
