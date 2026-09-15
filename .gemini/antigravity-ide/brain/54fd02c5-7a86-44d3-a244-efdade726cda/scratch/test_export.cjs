const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

async function testExport() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Audit Logs");

  worksheet.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  function safeMerge(ws, startRow, startCol, endRow, endCol) {
    if (startRow === endRow && startCol === endCol) return;
    if (endRow < startRow || endCol < startCol) return;
    ws.mergeCells(startRow, startCol, endRow, endCol);
  }

  const maxWidthCols = 9;

  for (let row = 1; row <= 5; row++) safeMerge(worksheet, row, 1, row, maxWidthCols);

  worksheet.getCell(1, 1).value = "PAMANTASAN NG LUNGSOD NG PASIG";

  // Dummy 1x1 PNG base64
  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const plpLogo = dummyPng;
  const customLogo = dummyPng;

  if (plpLogo) {
    try {
      const cleanPlp = plpLogo.replace(/^data:image\/(?:png|jpeg|jpg);base64,/, "");
      const logoId = workbook.addImage({ base64: cleanPlp, extension: "png" });
      worksheet.addImage(logoId, "A1:A3");
    } catch (e) {
      console.error("plpLogo error", e);
    }
  }

  if (customLogo) {
    try {
      const cleanCustom = customLogo.replace(/^data:image\/(?:png|jpeg|jpg);base64,/, "");
      const logoId = workbook.addImage({ base64: cleanCustom, extension: "png" });
      const lastColChar = String.fromCharCode(64 + Math.max(maxWidthCols, 1));
      worksheet.addImage(logoId, `${lastColChar}1:${lastColChar}3`);
    } catch (e) {
      console.error("customLogo error", e);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync("test_export.xlsx", Buffer.from(buffer));
  console.log("Saved test_export.xlsx");
}

testExport().catch(console.error);
