const ExcelJS = require("exceljs");
const fs = require("fs");

function getColumnLetter(colIndex) {
  let temp = 0;
  let letter = "";
  let col = colIndex;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter || "A";
}

function cleanBase64(dataUrl) {
  if (!dataUrl) return "";
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

async function runTest() {
  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const charts = [
    {
      title: "Attendance Rate Trend Across Sessions (%)",
      imageDataUrl: "data:image/png;base64," + dummyPng,
      caption: "Figure 1: Session attendance rate percentage trajectory across evaluated events.",
      description: "Tracks student participation rates across recent event sessions. Steady or upward trends indicate high event engagement.",
      recommendations: [
        "Schedule core workshops during peak engagement days (Tuesdays & Thursdays 9:00 AM - 11:00 AM).",
        "Dispatch automated SMS and Email check-in reminders 48 hours and 2 hours prior to scheduled sessions."
      ]
    },
    {
      title: "Random Forest Predicted Turnout by Event (%)",
      imageDataUrl: "data:image/png;base64," + dummyPng,
      caption: "Figure 2: ML-projected turnout probabilities per scheduled event.",
      description: "Machine learning turnout projections generated using Random Forest regression modeling.",
      recommendations: [
        "Focus promotional outreach on student segments with declining historical attendance records.",
        "Relocate events predicting turnout below 60% to central campus facilities."
      ]
    }
  ];

  const workbook = new ExcelJS.Workbook();
  const overviewWs = workbook.addWorksheet("Overview");
  overviewWs.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  let curRow = 1;
  overviewWs.getCell(curRow, 1).value = "VISUAL ANALYTICAL CHARTS";
  curRow++;

  charts.forEach((chart, idx) => {
    const chartRow = curRow;
    overviewWs.mergeCells(chartRow, 1, chartRow, 5);
    overviewWs.getCell(chartRow, 1).value = chart.title;
    overviewWs.getRow(chartRow).height = 20;

    const imgId = workbook.addImage({ base64: cleanBase64(chart.imageDataUrl), extension: "png" });
    overviewWs.addImage(imgId, {
      tl: { col: 0.1, row: chartRow },
      ext: { width: 440, height: 210 }
    });

    curRow += 12;

    if (chart.caption) {
      overviewWs.mergeCells(curRow, 1, curRow, 5);
      overviewWs.getCell(curRow, 1).value = chart.caption;
      curRow++;
    }

    if (chart.description || (chart.recommendations && chart.recommendations.length > 0)) {
      overviewWs.mergeCells(curRow, 1, curRow, 5);
      const calloutCell = overviewWs.getCell(curRow, 1);

      let calloutText = "";
      if (chart.description) calloutText += `CHART INSIGHT & ANALYSIS:\n${chart.description}`;
      if (chart.recommendations && chart.recommendations.length > 0) {
        if (calloutText) calloutText += "\n\n";
        calloutText += `STRATEGIC RECOMMENDATIONS:\n${chart.recommendations.map((r) => `• ${r}`).join("\n")}`;
      }

      calloutCell.value = calloutText;
      calloutCell.font = { size: 8.5, color: { argb: "FF1E293B" } };
      calloutCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      calloutCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      calloutCell.border = {
        top: { style: "thin", color: { argb: "FFBBF7D0" } },
        left: { style: "thin", color: { argb: "FFBBF7D0" } },
        bottom: { style: "thin", color: { argb: "FFBBF7D0" } },
        right: { style: "thin", color: { argb: "FFBBF7D0" } }
      };

      const lineCount = calloutText.split("\n").length;
      overviewWs.getRow(curRow).height = Math.max(36, Math.min(lineCount * 15 + 10, 120));
      curRow++;
    }

    curRow++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync(".gemini/antigravity-ide/brain/54fd02c5-7a86-44d3-a244-efdade726cda/scratch/test_chart_callouts.xlsx", Buffer.from(buffer));
  console.log("Successfully generated test_chart_callouts.xlsx!");
}

runTest().catch(console.error);
