const ExcelJS = require("exceljs");
const fs = require("fs");

async function testPageSetup() {
  const wb1 = new ExcelJS.Workbook();
  const ws1 = wb1.addWorksheet("WithDpi");
  ws1.pageSetup = { orientation: "portrait", fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalDpi: 300, verticalDpi: 300 };

  const buf1 = await wb1.xlsx.writeBuffer();

  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet("WithoutDpi");
  ws2.pageSetup = { orientation: "portrait", fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const buf2 = await wb2.xlsx.writeBuffer();

  fs.writeFileSync("wb1.xlsx", Buffer.from(buf1));
  fs.writeFileSync("wb2.xlsx", Buffer.from(buf2));
}

testPageSetup();
