const fs = require('fs');
const path = 'c:/Users/PLPASIG/Documents/Github/PLPass/src/features/organizer/pages/OrganizerAnalyticsPage.tsx';

let content = fs.readFileSync(path, 'utf8');

const chart1Target = `caption: "Figure 1: Session attendance rate percentage trajectory across evaluated events."`;
const chart1Replacement = `caption: "Figure 1: Session attendance rate percentage trajectory across evaluated events.",
          description: "Tracks student participation rates across recent event sessions. Steady or upward trends indicate high event engagement, whereas sharp dips signal potential scheduling conflicts or suboptimal session timing.",
          recommendations: [
            "Schedule core workshops during peak engagement days (Tuesdays & Thursdays 9:00 AM - 11:00 AM).",
            "Dispatch automated SMS and Email check-in reminders 48 hours and 2 hours prior to scheduled sessions."
          ]`;

const chart2Target = `caption: "Figure 2: ML-projected turnout probabilities per scheduled event."`;
const chart2Replacement = `caption: "Figure 2: ML-projected turnout probabilities per scheduled event.",
          description: "Machine learning turnout projections generated using Random Forest regression. Evaluates student attendance history, venue accessibility, and event categorization to forecast expected turnout percentage.",
          recommendations: [
            "Focus promotional outreach on student segments with declining historical attendance records.",
            "Relocate events predicting turnout below 60% to central campus facilities to boost attendance confidence."
          ]`;

const chart3Target = `caption: "Figure 3: Distribution of student feedback sentiment labels."`;
const chart3Replacement = `caption: "Figure 3: Distribution of student feedback sentiment labels.",
          description: "Post-event student feedback sentiment breakdown measured using VADER sentiment analysis. High positive sentiment correlates directly with speaker quality and practical learning outcomes.",
          recommendations: [
            "Re-engage top-rated facilitators and maintain interactive hands-on session formats.",
            "Promptly resolve recurring venue issues (e.g. room temperature, audio setup) highlighted in feedback comments."
          ]`;

const chart4Target = `caption: "Figure 4: Breakdown of reported tardiness reasons among participants."`;
const chart4Replacement = `caption: "Figure 4: Breakdown of reported tardiness reasons among participants.",
          description: "Categorized distribution of late check-in reasons submitted by students. Identifying primary tardiness drivers informs administrative policy on check-in grace periods and event scheduling.",
          recommendations: [
            "Establish a 15-minute grace period buffer for early morning sessions to accommodate commute delays.",
            "Avoid scheduling mandatory campus events immediately following peak academic lecture hours."
          ]`;

if (!content.includes(chart1Target)) {
  console.error('chart1Target not found!');
  process.exit(1);
}

content = content
  .replace(chart1Target, chart1Replacement)
  .replace(chart2Target, chart2Replacement)
  .replace(chart3Target, chart3Replacement)
  .replace(chart4Target, chart4Replacement);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated OrganizerAnalyticsPage.tsx');
