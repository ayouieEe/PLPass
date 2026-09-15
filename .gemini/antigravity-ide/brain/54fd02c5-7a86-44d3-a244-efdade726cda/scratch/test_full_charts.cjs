const ExcelJS = require("exceljs");
const fs = require("fs");

function cleanBase64(dataUrl) {
  if (!dataUrl) return "";
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function safeSheetName(name, index = 0, existingNames = new Set()) {
  let clean = name.replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 28) || `Sheet ${index + 1}`;
  let finalName = clean;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${clean.slice(0, 24)} (${counter})`;
    counter++;
  }
  existingNames.add(finalName.toLowerCase());
  return finalName;
}

function safeMerge(ws, startRow, startCol, endRow, endCol) {
  if (startRow === endRow && startCol === endCol) return;
  if (endRow < startRow || endCol < startCol) return;
  ws.mergeCells(startRow, startCol, endRow, endCol);
}

async function testFullSpreadsheetWithCharts() {
  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const options = {
    title: "PLPass Master Analytics Report",
    sections: [
      {
        name: "Attendance Summary",
        rows: [
          { "Event Code": "EVT-2026-001", "Event Date": "2026-09-15", "Attendance Rate": "85%", Present: 85, Late: 10, Absent: 5, Registered: 100 },
          { "Event Code": "EVT-2026-002", "Event Date": "2026-09-16", "Attendance Rate": "90%", Present: 90, Late: 5, Absent: 5, Registered: 100 }
        ]
      },
      {
        name: "Turnout Prediction",
        rows: [
          { "Event Code": "EVT-2026-001", "Event Title": "CCS Orientation", "Event Date": "2026-09-15", "Predicted Attendance": "88%", "Predicted Absences": "12%" }
        ]
      }
    ],
    fileName: "plpass-master-analytics-with-charts",
    filters: {
      "Target Event": "All Events",
      Category: "All Categories",
      "Time Horizon": "Last 6 Months"
    },
    summaryCards: [
      { label: "Overall Attendance", value: "87%", subtitle: "Average across session logs", colorTheme: "emerald" },
      { label: "Turnout Forecast", value: "88%", subtitle: "Random Forest predicted turnout", colorTheme: "blue" }
    ],
    insightsNarrative: {
      title: "EXECUTIVE ANALYTICAL SUMMARY & INSIGHTS",
      executiveSummary: "This Master Analytics Report synthesizes student participation trends across PLP events.",
      keyFindings: ["Overall session attendance rate is 87%."],
      recommendations: ["Schedule core events during high-turnout morning windows."]
    },
    charts: [
      {
        title: "Attendance Rate Trend Across Sessions (%)",
        imageDataUrl: "data:image/png;base64," + dummyPng,
        caption: "Figure 1: Session attendance rate percentage trajectory."
      },
      {
        title: "Random Forest Predicted Turnout by Event (%)",
        imageDataUrl: "data:image/png;base64," + dummyPng,
        caption: "Figure 2: ML-projected turnout probabilities per scheduled event."
      }
    ]
  };

  const workbook = new ExcelJS.Workbook();
  const sheetNames = new Set();
  const plpLogo = "data:image/png;base64," + dummyPng;
  const customLogo = "data:image/png;base64," + dummyPng;

  const headerLines = ["PAMANTASAN NG LUNGSOD NG PASIG", "COLLEGE OF ALL PARTICIPATING COLLEGES", "SCHOOL YEAR CURRENT SCHOOL YEAR"];

  function addHeaderBanner(ws, maxWidthCols, subtitle, title) {
    for (let r = 1; r <= 5; r++) safeMerge(ws, r, 1, r, maxWidthCols);
    headerLines.forEach((line, idx) => {
      const cell = ws.getCell(idx + 1, 1);
      cell.value = line;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { bold: true, size: idx === 0 ? 14 : 10, color: { argb: "FF0F421D" } };
    });
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 19;
    ws.getRow(3).height = 17;
    ws.getRow(4).height = 17;
    ws.getCell(4, 1).value = subtitle || "";
    ws.getCell(4, 1).font = { italic: true, size: 9, color: { argb: "FF526155" } };

    ws.getCell(5, 1).value = title.toUpperCase();
    ws.getCell(5, 1).font = { bold: true, size: 13, color: { argb: "FF1A371F" } };
    ws.getCell(5, 1).alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(5).height = 24;

    const cleanPlp = cleanBase64(plpLogo);
    if (cleanPlp) {
      const logoId = workbook.addImage({ base64: cleanPlp, extension: "png" });
      ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 48, height: 48 } });
    }
    const cleanCustom = cleanBase64(customLogo);
    if (cleanCustom) {
      const logoId = workbook.addImage({ base64: cleanCustom, extension: "png" });
      ws.addImage(logoId, { tl: { col: Math.max(maxWidthCols - 1, 1) + 0.1, row: 0.1 }, ext: { width: 48, height: 48 } });
    }
  }

  // 1. Overview Tab
  const overviewWs = workbook.addWorksheet(safeSheetName("Overview", 0, sheetNames));
  overviewWs.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  const overviewMaxCols = 5;
  addHeaderBanner(overviewWs, overviewMaxCols, options.subtitle || "Executive Dashboard & Report Index", options.title);

  const filterEntries = Object.entries(options.filters || {}).map(([k, v]) => `${k}: ${v}`);
  const generatedLine = `Date Generated: ${new Date().toLocaleString()}  ·  Total Data Tabs: ${options.sections.length}`;

  safeMerge(overviewWs, 6, 1, 6, overviewMaxCols);
  overviewWs.getCell(6, 1).value = generatedLine;
  overviewWs.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
  overviewWs.getRow(6).height = 18;

  filterEntries.forEach((line, rowIndex) => {
    const row = 7 + rowIndex;
    safeMerge(overviewWs, row, 1, row, overviewMaxCols);
    overviewWs.getCell(row, 1).value = line;
    overviewWs.getCell(row, 1).font = { size: 9, color: { argb: "FF526155" } };
    overviewWs.getRow(row).height = 17;
  });

  let curRow = 7 + filterEntries.length + 1;

  // Render Charts on Overview Tab if present
  if (options.charts && options.charts.length > 0) {
    curRow++;
    safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
    overviewWs.getCell(curRow, 1).value = "VISUAL ANALYTICAL CHARTS";
    overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: "FF0F421D" } };
    overviewWs.getRow(curRow).height = 22;
    curRow++;

    options.charts.forEach((chart, idx) => {
      const chartRow = curRow;
      safeMerge(overviewWs, chartRow, 1, chartRow, overviewMaxCols);
      const titleCell = overviewWs.getCell(chartRow, 1);
      titleCell.value = chart.title || `Visual Chart ${idx + 1}`;
      titleCell.font = { bold: true, size: 9.5, color: { argb: "FF15803D" } };
      overviewWs.getRow(chartRow).height = 20;

      const cleanImg = cleanBase64(chart.imageDataUrl);
      if (cleanImg) {
        try {
          const imgId = workbook.addImage({ base64: cleanImg, extension: "png" });
          overviewWs.addImage(imgId, {
            tl: { col: 0.1, row: chartRow },
            ext: { width: 440, height: 210 }
          });
        } catch (e) {
          console.error("Chart embed error", e);
        }
      }

      curRow += 12;

      if (chart.caption) {
        safeMerge(overviewWs, curRow, 1, curRow, overviewMaxCols);
        const capCell = overviewWs.getCell(curRow, 1);
        capCell.value = chart.caption;
        capCell.font = { italic: true, size: 8.5, color: { argb: "FF64748B" } };
        overviewWs.getRow(curRow).height = 18;
        curRow++;
      }

      curRow++;
    });
  }

  for (let c = 1; c <= overviewMaxCols; c++) overviewWs.getColumn(c).width = 24;

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync("full_master_with_charts.xlsx", Buffer.from(buffer));
  console.log("Wrote full_master_with_charts.xlsx successfully!");
}

testFullSpreadsheetWithCharts().catch(console.error);
