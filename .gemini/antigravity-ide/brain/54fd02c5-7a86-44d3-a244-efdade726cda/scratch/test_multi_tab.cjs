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
    finalName = `${clean.slice(0, 25)} (${counter})`;
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

async function testMultiTabExport() {
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
      },
      {
        name: "Performance and Sentiment",
        rows: [
          { "Event Code": "EVT-2026-001", Positive: "78%", Neutral: "15%", Negative: "7%" }
        ]
      },
      {
        name: "Late Arrival Patterns",
        rows: [
          { "Event Code": "EVT-2026-001", "Event Date": "2026-09-15", Late: 10, "Late Rate": "10%" }
        ]
      }
    ],
    fileName: "plpass-master-analytics-tabs",
    filters: {
      "Target Event": "All Events",
      Category: "All Categories",
      "Time Horizon": "Last 6 Months"
    },
    summaryCards: [
      { label: "Overall Attendance", value: "87%", subtitle: "Average across session logs", colorTheme: "emerald" },
      { label: "Turnout Forecast", value: "88%", subtitle: "Random Forest predicted turnout", colorTheme: "blue" },
      { label: "Positive Sentiment", value: "78%", subtitle: "Favorable feedback share", colorTheme: "amber" },
      { label: "Top Tardiness Cause", value: "Traffic / Commute", subtitle: "18 check-ins (40%)", colorTheme: "purple" }
    ],
    insightsNarrative: {
      title: "EXECUTIVE ANALYTICAL SUMMARY & INSIGHTS",
      executiveSummary: "This Master Analytics Report synthesizes student participation trends across PLP events.",
      keyFindings: [
        "Overall session attendance rate is 87%, with top sessions achieving up to 90% turnout.",
        "Machine learning Random Forest model predicts an average turnout of 88%.",
        "Post-event student feedback reflects a 78% positive sentiment rate."
      ],
      recommendations: [
        "Schedule core events during high-turnout morning windows (9:00 AM - 11:00 AM).",
        "Provide automated event reminders 48 hours prior to scheduled start times."
      ]
    }
  };

  const workbook = new ExcelJS.Workbook();
  const sheetNames = new Set();
  const dummyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
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

  // 1. Overview Tab (if multi-section or insights present)
  if (options.sections.length > 1 || options.summaryCards || options.insightsNarrative) {
    const overviewWs = workbook.addWorksheet(safeSheetName("Overview", 0, sheetNames));
    overviewWs.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

    const maxWidthCols = 6;
    addHeaderBanner(overviewWs, maxWidthCols, options.subtitle || "Executive Dashboard & Multi-Section Index", options.title);

    const filterEntries = Object.entries(options.filters || {}).map(([k, v]) => `${k}: ${v}`);
    const generatedLine = `Date Generated: ${new Date().toLocaleString()}  ·  Total Data Tabs: ${options.sections.length}`;

    safeMerge(overviewWs, 6, 1, 6, maxWidthCols);
    overviewWs.getCell(6, 1).value = generatedLine;
    overviewWs.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
    overviewWs.getRow(6).height = 18;

    filterEntries.forEach((line, rowIndex) => {
      const row = 7 + rowIndex;
      safeMerge(overviewWs, row, 1, row, maxWidthCols);
      overviewWs.getCell(row, 1).value = line;
      overviewWs.getCell(row, 1).font = { size: 9, color: { argb: "FF526155" } };
      overviewWs.getRow(row).height = 17;
    });

    let curRow = 7 + filterEntries.length + 1;

    // KPI Summary
    if (options.summaryCards && options.summaryCards.length > 0) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, maxWidthCols);
      const titleCell = overviewWs.getCell(curRow, 1);
      titleCell.value = "KEY PERFORMANCE SUMMARY";
      titleCell.font = { bold: true, size: 10, color: { argb: "FF0F421D" } };
      overviewWs.getRow(curRow).height = 20;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= maxWidthCols) {
          const hCell = overviewWs.getCell(curRow, colIdx);
          hCell.value = card.label.toUpperCase();
          hCell.font = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
          hCell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      overviewWs.getRow(curRow).height = 22;
      curRow++;

      options.summaryCards.forEach((card, idx) => {
        const colIdx = idx + 1;
        if (colIdx <= maxWidthCols) {
          const vCell = overviewWs.getCell(curRow, colIdx);
          vCell.value = `${card.value}${card.subtitle ? `\n${card.subtitle}` : ""}`;
          vCell.font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
          vCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
          vCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          vCell.border = {
            top: { style: "thin", color: { argb: "FFBBF7D0" } },
            left: { style: "thin", color: { argb: "FFBBF7D0" } },
            bottom: { style: "thin", color: { argb: "FFBBF7D0" } },
            right: { style: "thin", color: { argb: "FFBBF7D0" } }
          };
        }
      });
      overviewWs.getRow(curRow).height = 36;
      curRow += 2;
    }

    // Insights Narrative
    if (options.insightsNarrative) {
      curRow++;
      safeMerge(overviewWs, curRow, 1, curRow, maxWidthCols);
      overviewWs.getCell(curRow, 1).value = options.insightsNarrative.title || "EXECUTIVE ANALYTICAL INSIGHTS";
      overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: "FF0F421D" } };
      overviewWs.getRow(curRow).height = 22;
      curRow++;

      const insightHeaders = ["Analysis Topic", "Executive Overview", "Key Findings", "Strategic Recommendations"];
      insightHeaders.forEach((hText, idx) => {
        const colIdx = idx + 1;
        const cell = overviewWs.getCell(curRow, colIdx);
        cell.value = hText;
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      overviewWs.getRow(curRow).height = 24;
      curRow++;

      const summaryData = [
        options.title,
        options.insightsNarrative.executiveSummary,
        (options.insightsNarrative.keyFindings || []).map(f => `• ${f}`).join("\n"),
        (options.insightsNarrative.recommendations || []).map(r => `• ${r}`).join("\n")
      ];

      summaryData.forEach((val, idx) => {
        const colIdx = idx + 1;
        const cell = overviewWs.getCell(curRow, colIdx);
        cell.value = val;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
        cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
      overviewWs.getRow(curRow).height = 90;
      curRow += 2;
    }

    // Index of Worksheet Tabs
    curRow++;
    safeMerge(overviewWs, curRow, 1, curRow, maxWidthCols);
    overviewWs.getCell(curRow, 1).value = "REPORT WORKSHEETS & SECTIONS INDEX";
    overviewWs.getCell(curRow, 1).font = { bold: true, size: 10.5, color: { argb: "FF0F421D" } };
    overviewWs.getRow(curRow).height = 22;
    curRow++;

    const indexHeaders = ["Tab #", "Worksheet Name", "Section Category", "Included Records", "Status"];
    indexHeaders.forEach((hText, idx) => {
      const cell = overviewWs.getCell(curRow, idx + 1);
      cell.value = hText;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    overviewWs.getRow(curRow).height = 24;
    curRow++;

    options.sections.forEach((sec, sIdx) => {
      const rowIdx = curRow;
      const rowVals = [`Tab ${sIdx + 1}`, sec.name, "Analytics Data", `${sec.rows.length} records`, "Complete"];
      rowVals.forEach((val, colIdx) => {
        const cell = overviewWs.getCell(rowIdx, colIdx + 1);
        cell.value = val;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };
        cell.alignment = { horizontal: colIdx === 0 || colIdx === 3 ? "center" : "left", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
      overviewWs.getRow(rowIdx).height = 20;
      curRow++;
    });

    // Auto-fit overview cols
    for (let c = 1; c <= maxWidthCols; c++) overviewWs.getColumn(c).width = 25;
  }

  // 2. Individual Section Tabs
  options.sections.forEach((sec, sIdx) => {
    const wsName = safeSheetName(sec.name, sIdx + 1, sheetNames);
    const ws = workbook.addWorksheet(wsName);
    ws.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

    const headers = Object.keys(sec.rows[0] || {}).map(h => h.toUpperCase());
    const maxWidthCols = Math.max(headers.length, 5);

    addHeaderBanner(ws, maxWidthCols, `Section ${sIdx + 1}: ${sec.name}`, `${options.title} — ${sec.name}`);

    safeMerge(ws, 6, 1, 6, maxWidthCols);
    ws.getCell(6, 1).value = `Section Records: ${sec.rows.length}  ·  Generated: ${new Date().toLocaleDateString()}`;
    ws.getCell(6, 1).font = { size: 9, color: { argb: "FF526155" } };
    ws.getRow(6).height = 18;

    let curRow = 8;
    const tableHeaderRowIdx = curRow;

    headers.forEach((hText, colIdx) => {
      const cell = ws.getCell(tableHeaderRowIdx, colIdx + 1);
      cell.value = hText;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F421D" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF0F421D" } },
        left: { style: "thin", color: { argb: "FF0F421D" } },
        bottom: { style: "medium", color: { argb: "FF0F421D" } },
        right: { style: "thin", color: { argb: "FF0F421D" } }
      };
    });
    ws.getRow(tableHeaderRowIdx).height = 25;
    curRow++;

    sec.rows.forEach((row, rIdx) => {
      const dataRowIdx = curRow;
      headers.forEach((hText, colIdx) => {
        const origKey = Object.keys(row).find(k => k.toUpperCase() === hText);
        const val = String(row[origKey] ?? "");
        const cell = ws.getCell(dataRowIdx, colIdx + 1);
        cell.value = val;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };

        const isNumeric = !isNaN(Number(val)) && val.trim() !== "";
        cell.alignment = { horizontal: isNumeric ? "right" : "left", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (rIdx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } };
      });
      ws.getRow(dataRowIdx).height = 20;
      curRow++;
    });

    if (headers.length > 0 && sec.rows.length > 0) {
      ws.autoFilter = {
        from: { row: tableHeaderRowIdx, column: 1 },
        to: { row: tableHeaderRowIdx + sec.rows.length, column: headers.length }
      };
    }

    // Auto-fit column widths
    for (let c = 1; c <= maxWidthCols; c++) {
      let maxLen = 12;
      if (headers[c - 1]) maxLen = Math.max(maxLen, headers[c - 1].length);
      sec.rows.forEach(r => {
        const key = Object.keys(r)[c - 1];
        if (r[key]) maxLen = Math.max(maxLen, String(r[key]).length);
      });
      ws.getColumn(c).width = Math.min(Math.max(maxLen + 4, 15), 45);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync("multi_tab_master_report.xlsx", Buffer.from(buffer));
  console.log("Generated multi_tab_master_report.xlsx successfully!");
}

testMultiTabExport().catch(console.error);
