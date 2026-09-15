const ExcelJS = require("exceljs");
const fs = require("fs");

function cleanBase64(dataUrl) {
  if (!dataUrl) return "";
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

async function testChartEmbed() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Charts Test");
  ws.views = [{ showGridLines: true }];

  ws.getCell(1, 1).value = "VISUAL ANALYTICAL CHARTS";
  ws.getCell(1, 1).font = { bold: true, size: 12 };

  // Dummy 1x1 PNG base64
  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const clean = cleanBase64(dummyPng);

  const imgId = workbook.addImage({ base64: clean, extension: "png" });

  // Add image starting at row 3, col 1 with width 400px height 200px
  ws.addImage(imgId, {
    tl: { col: 0.2, row: 2.2 },
    ext: { width: 400, height: 200 }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync("chart_test.xlsx", Buffer.from(buffer));
  console.log("Wrote chart_test.xlsx");
}

testChartEmbed().catch(console.error);
