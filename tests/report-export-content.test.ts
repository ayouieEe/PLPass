import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const eventRecordsSource = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");
const analyticsSource = readFileSync("src/features/organizer/pages/OrganizerAnalyticsPage.tsx", "utf8");

describe("report export content", () => {
  it("includes event dates in every attendance export path", () => {
    expect(eventRecordsSource.match(/"Event Date":/g)?.length).toBeGreaterThanOrEqual(2);
    expect(readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8")).toContain('"Event Date": record.date');
  });

  it("keeps raw feedback comments to a single-event Event Summary", () => {
    expect(eventRecordsSource).toContain("const singleEvent = orderedEvents.length === 1 ? orderedEvents[0] : undefined;");
    expect(eventRecordsSource).toContain("if (singleEvent?.feedbackComments.length)");
    expect(analyticsSource).not.toContain("Submitted Feedback Comments");
  });

  it("limits specialist analytics reports to their relevant outcome sections", () => {
    expect(analyticsSource).toContain('{ name: "Post-Event Objective Results", scoreCards: objectiveScoreCards, rows: objectiveResultRows }, { name: "Feedback Labels", rows: sentimentRows }');
    expect(analyticsSource).toContain('{ name: "Late Arrival Overview"');
    expect(analyticsSource).toContain('trendLabels.length >= 2');
    expect(analyticsSource).toMatch(/const summaryCards: ReportSummaryCard\[\] = request\.reportType === "master"\s+\? \[attendanceSummaryCard, savedEstimateSummaryCard, feedbackSummaryCard, lateArrivalSummaryCard\]/);
    expect(analyticsSource).not.toContain('scoreCards: objectiveScoreCards,\n        insightsNarrative');
  });

  it("groups objective score cards by event and keeps every export landscape", () => {
    expect(eventRecordsSource).toContain('{ name: "Post-Event Objective Results", xlsxSheet, scoreCards: objectiveScoreCards');
    expect(eventRecordsSource).toContain("const recommendation = actionableRecommendation({");
    expect(eventRecordsSource).toContain("recommendations: recommendation ? [recommendation] : []");
    expect(analyticsSource).toContain("const recommendationRows = selectedEvents.flatMap");
    expect(analyticsSource).toContain('{ name: "Recommendation", rows: recommendationRows.length');
    expect(analyticsSource).toContain('group: eventLabelsById.get(objective.eventId)');
    const reportSource = readFileSync("src/lib/exports/reportExport.ts", "utf8");
    expect(reportSource).toContain("const isLandscape = true;");
    expect(reportSource).toContain('const recommendationLabel = "RECOMMENDATION";');
    expect(reportSource).toContain("function figureCaption(chart: ReportChartItem, index: number)");
    expect(reportSource).toContain("Figure ${index + 1}:");
    expect(reportSource).toContain("cursorY += chartMmHeight + 5;");
    expect(reportSource).not.toContain('Strategic Recommendations:');
    expect(reportSource).not.toContain('RECOMMENDED NEXT STEPS');
    expect(reportSource).not.toContain('Actionable Recommendations:');
    expect(reportSource).toContain("const renderScoreCards =");
    expect(reportSource).toContain("function chartMatchesSection(chart: ReportChartItem, section: ReportExportSection)");
    expect(reportSource).toContain('sectionName === "attendance overview"');
    expect(reportSource).toContain('sectionName.includes("saved turnout estimate")');
    expect(reportSource).toContain('sectionName === "turnout estimate"');
    expect(reportSource).toContain('sectionName === "feedback labels"');
    expect(reportSource).toContain('sectionName === "late arrival breakdown"');
    expect(reportSource).toContain("const renderedChartIndexes = new Set<number>();");
    expect(reportSource.indexOf("renderChart(chart, chartIndex);")).toBeLessThan(reportSource.indexOf("const headers = headersFor(section);"));
    expect(reportSource).not.toContain("doc.text(chart.title, 14, cursorY);");
    expect(reportSource).toContain("const keepTableTogether = tableBody.length <= 8;");
    expect(reportSource).toContain('pageBreak: keepTableTogether ? "avoid" : "auto"');
    expect(reportSource).toContain('rowPageBreak: "avoid"');
    expect(reportSource).toContain("options.charts?.find((chart) => chartMatchesSection(chart, firstSection))");
    expect(reportSource).toContain("if (section.scoreCards?.length) renderScoreCards(section.scoreCards);");
    expect(reportSource.indexOf("if (section.scoreCards?.length) renderScoreCards(section.scoreCards);")).toBeLessThan(reportSource.indexOf("const headers = headersFor(section);"));
    expect(reportSource).toContain('orientation: "landscape"');
    expect(analyticsSource).toContain("recommendations: attendanceRecommendation ? [attendanceRecommendation] : []");
    expect(analyticsSource).toContain("recommendations: performanceRecommendation ? [performanceRecommendation] : []");
    expect(analyticsSource).toContain("recommendations: lateRecommendation ? [lateRecommendation] : []");
  });

  it("orders all-event reports and starts each event on a separate page", () => {
    expect(eventRecordsSource).toContain("const orderedEvents = events.length > 1 ? [...events].sort");
    expect(eventRecordsSource).toContain("pageBreakBefore: eventIndex > 0");
    expect(analyticsSource).toContain("const selectedEvents = [...filteredEventData].sort");
  });

  it("keeps all Event Summary content for one event on one XLSX worksheet", () => {
    expect(eventRecordsSource).toContain("const xlsxSheet = `${event.code} ${event.name}`");
    expect(eventRecordsSource.match(/xlsxSheet,/g)?.length).toBeGreaterThanOrEqual(4);
    expect(eventRecordsSource).toContain('xlsxSheet: `${singleEvent.code} ${singleEvent.name}`');
    const reportSource = readFileSync("src/lib/exports/reportExport.ts", "utf8");
    expect(reportSource).toContain("const worksheetGroups = sections.reduce");
    expect(reportSource).toContain("function renderInsightsNarrative(ws: Worksheet, startRow: number, maxCols: number)");
    expect(reportSource).toContain("curRow = renderInsightsNarrative(overviewWs, curRow, overviewMaxCols);");
    expect(reportSource).toContain("curRow = renderInsightsNarrative(worksheet, curRow, maxWidthCols);");
    expect(reportSource).toContain("group.sections.forEach((section, sectionIdx) =>");
    expect(reportSource).toContain("isMultiTab || firstSection.xlsxSheet");
  });
});
