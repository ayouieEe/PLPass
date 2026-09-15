const ExcelJS = require("exceljs");
const fs = require("fs");

function getColumnLetter(colIndex) {
  let temp = "";
  let letter = "";
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIndex = Math.floor((colIndex - 1) / 26);
  }
  return letter || "A";
}

function cleanBase64(dataUrl) {
  if (!dataUrl) return "";
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

async function testFixedExport() {
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
    fileName: "plpass-master-analytics-all-events-2026-09-15",
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
    }
  };

  const { title, sections, summaryCards, insightsNarrative, filters } = options;

  function cleanTitle(val) {
    return val.replace(/\s+(?:XLSX|PDF)$/i, "").trim();
  }

  function headersFor(sec) {
    return Object.keys(sec.rows[0] || {}).map(h => h.toUpperCase());
  }

  function valuesFor(sec, headers) {
    return sec.rows.map(row => headers.map(h => {
      const key = Object.keys(row).find(k => k.toUpperCase() === h);
      return String(row[key] ?? "");
    }));
  }

  function safeMerge(ws, startRow, startCol, endRow, endCol) {
    if (startRow === endRow && startCol === endCol) return;
    if (endRow < startRow || endCol < startCol) return;
    ws.mergeCells(startRow, startCol, endRow, endCol);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(cleanTitle(title).slice(0, 30) || "Analytics Report");

  worksheet.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  const header = ["PAMANTASAN NG LUNGSOD NG PASIG", "COLLEGE OF ALL PARTICIPATING COLLEGES", "SCHOOL YEAR CURRENT SCHOOL YEAR"];
  const filterEntries = Object.entries(filters).map(([k, v]) => `${k}: ${v}`);
  const total = sections.reduce((sum, s) => sum + s.rows.length, 0);
  const generatedLine = `Date Generated: ${new Date().toLocaleString()}  ·  Total Records: ${total}`;

  const maxWidthCols = Math.max(...sections.map(s => headersFor(s).length), 5);

  for (let row = 1; row <= 5; row++) safeMerge(worksheet, row, 1, row, maxWidthCols);
  header.forEach((line, rowIndex) => {
    const cell = worksheet.getCell(rowIndex + 1, 1);
    cell.value = line;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = { bold: true, size: rowIndex === 0 ? 14 : 10, color: { argb: "FF0F421D" } };
  });

  worksheet.getCell(5, 1).value = cleanTitle(title).toUpperCase();

  safeMerge(worksheet, 6, 1, 6, maxWidthCols);
  worksheet.getCell(6, 1).value = generatedLine;

  filterEntries.forEach((line, rowIndex) => {
    const row = 7 + rowIndex;
    safeMerge(worksheet, row, 1, row, maxWidthCols);
    worksheet.getCell(row, 1).value = line;
  });

  let currentRow = 7 + filterEntries.length + 1;

  if (summaryCards && summaryCards.length > 0) {
    currentRow++;
    safeMerge(worksheet, currentRow, 1, currentRow, maxWidthCols);
    worksheet.getCell(currentRow, 1).value = "KEY PERFORMANCE SUMMARY";
    currentRow++;

    summaryCards.forEach((card, idx) => {
      const colIdx = idx + 1;
      if (colIdx <= maxWidthCols) {
        worksheet.getCell(currentRow, colIdx).value = card.label.toUpperCase();
      }
    });
    currentRow++;

    summaryCards.forEach((card, idx) => {
      const colIdx = idx + 1;
      if (colIdx <= maxWidthCols) {
        worksheet.getCell(currentRow, colIdx).value = `${card.value}\n${card.subtitle || ""}`;
      }
    });
    currentRow += 2;
  }

  if (insightsNarrative) {
    currentRow++;
    safeMerge(worksheet, currentRow, 1, currentRow, maxWidthCols);
    worksheet.getCell(currentRow, 1).value = insightsNarrative.title;
    currentRow++;

    const insightHeaders = ["Analysis Topic", "Executive Overview", "Key Finding", "Strategic Recommendation"];
    const colSpan = Math.max(Math.floor(maxWidthCols / insightHeaders.length), 1);

    insightHeaders.forEach((hText, hIdx) => {
      const startCol = hIdx * colSpan + 1;
      const endCol = hIdx === insightHeaders.length - 1 ? maxWidthCols : (hIdx + 1) * colSpan;
      safeMerge(worksheet, currentRow, startCol, currentRow, endCol);
      worksheet.getCell(currentRow, startCol).value = hText;
    });
    currentRow++;

    const summaryRowData = [
      title,
      insightsNarrative.executiveSummary,
      (insightsNarrative.keyFindings || []).join("\n"),
      (insightsNarrative.recommendations || []).join("\n")
    ];

    summaryRowData.forEach((val, hIdx) => {
      const startCol = hIdx * colSpan + 1;
      const endCol = hIdx === insightHeaders.length - 1 ? maxWidthCols : (hIdx + 1) * colSpan;
      safeMerge(worksheet, currentRow, startCol, currentRow, endCol);
      worksheet.getCell(currentRow, startCol).value = val;
    });
    currentRow += 2;
  }

  sections.forEach((section, sIdx) => {
    currentRow++;
    safeMerge(worksheet, currentRow, 1, currentRow, maxWidthCols);
    worksheet.getCell(currentRow, 1).value = section.name.toUpperCase();
    currentRow++;

    const headers = headersFor(section);
    const values = valuesFor(section, headers);

    const tableHeaderRowIdx = currentRow;

    headers.forEach((headerText, colIdx) => {
      worksheet.getCell(tableHeaderRowIdx, colIdx + 1).value = headerText;
    });
    currentRow++;

    values.forEach((rowValues, rIdx) => {
      const dataRowIdx = currentRow;
      rowValues.forEach((val, colIdx) => {
        worksheet.getCell(dataRowIdx, colIdx + 1).value = val;
      });
      currentRow++;
    });

    if (sIdx === 0 && headers.length > 0 && values.length > 0) {
      worksheet.autoFilter = {
        from: { row: tableHeaderRowIdx, column: 1 },
        to: { row: tableHeaderRowIdx + values.length, column: headers.length }
      };
    }

    currentRow += 2;
  });

  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const plpLogo = "data:image/png;base64," + dummyPng;
  const customLogo = "data:image/png;base64," + dummyPng;

  if (plpLogo) {
    const cleanPlp = cleanBase64(plpLogo);
    if (cleanPlp) {
      const logoId = workbook.addImage({ base64: cleanPlp, extension: "png" });
      worksheet.addImage(logoId, {
        tl: { col: 0.1, row: 0.1 },
        ext: { width: 48, height: 48 }
      });
    }
  }

  if (customLogo) {
    const cleanCustom = cleanBase64(customLogo);
    if (cleanCustom) {
      const logoId = workbook.addImage({ base64: cleanCustom, extension: "png" });
      worksheet.addImage(logoId, {
        tl: { col: Math.max(maxWidthCols - 1, 1) + 0.1, row: 0.1 },
        ext: { width: 48, height: 48 }
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync("fixed_master_report.xlsx", Buffer.from(buffer));
  console.log("Generated fixed_master_report.xlsx successfully!");
}

testFixedExport().catch(console.error);
