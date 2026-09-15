const ExcelJS = require("exceljs");
const fs = require("fs");

async function testAutoFilter() {
  const wb1 = new ExcelJS.Workbook();
  const ws1 = wb1.addWorksheet("ObjFilter");
  ws1.addRow(["Name", "Age"]);
  ws1.addRow(["Alice", 30]);
  ws1.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 2, column: 2 }
  };
  const buf1 = await wb1.xlsx.writeBuffer();
  fs.writeFileSync("autofilter_obj.xlsx", Buffer.from(buf1));

  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet("StrFilter");
  ws2.addRow(["Name", "Age"]);
  ws2.addRow(["Alice", 30]);
  ws2.autoFilter = "A1:B2";
  const buf2 = await wb2.xlsx.writeBuffer();
  fs.writeFileSync("autofilter_str.xlsx", Buffer.from(buf2));

  console.log("Wrote autofilter files");
}

testAutoFilter();
