/**
 * Utility for generating high-DPI PNG chart images using offscreen HTML5 Canvas.
 * These images can be embedded directly into jsPDF reports and ExcelJS worksheets.
 */

export interface BarChartSeries {
  name: string;
  data: number[];
  color: string;
}

export interface BarChartOptions {
  title?: string;
  categories: string[];
  series: BarChartSeries[];
  unit?: string;
  width?: number;
  height?: number;
  maxValue?: number;
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartOptions {
  title?: string;
  slices: DonutSlice[];
  centerText?: string;
  centerSubtext?: string;
  width?: number;
  height?: number;
}

export interface LineChartOptions {
  title?: string;
  labels: string[];
  data: number[];
  color?: string;
  unit?: string;
  width?: number;
  height?: number;
}

/**
 * Creates an offscreen canvas with 2x resolution for retina-crisp rendering.
 */
function createCrispCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  const scale = 2; // 2x for sharp rendering in PDF & Excel
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2D canvas context");
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

/**
 * Draws a rounded rectangle helper.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillColor?: string,
  strokeColor?: string,
  lineWidth = 1
) {
  if (w <= 0 || h <= 0) return;
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/**
 * Generates a crisp Bar Chart PNG data URL.
 */
export function generateBarChartPng(options: BarChartOptions): string {
  const width = options.width ?? 600;
  const height = options.height ?? 320;
  const { canvas, ctx } = createCrispCanvas(width, height);

  // Background card
  drawRoundedRect(ctx, 0, 0, width, height, 12, "#FFFFFF", "#E2E8F0", 1);

  let currentY = 16;
  if (options.title) {
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#0F172A";
    ctx.fillText(options.title, 20, currentY + 12);
    currentY += 32;
  } else {
    currentY += 8;
  }

  // Draw Legend if multiple series
  if (options.series.length > 1) {
    let legendX = 20;
    options.series.forEach((s) => {
      drawRoundedRect(ctx, legendX, currentY, 12, 12, 3, s.color);
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText(s.name, legendX + 16, currentY + 10);
      legendX += ctx.measureText(s.name).width + 36;
    });
    currentY += 24;
  }

  const paddingLeft = 50;
  const paddingRight = 24;
  const paddingBottom = 45;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - currentY - paddingBottom;

  // Compute max value
  const allValues = options.series.flatMap((s) => s.data);
  const calculatedMax = Math.max(...allValues, 10);
  const maxVal = options.maxValue ?? (Math.ceil(calculatedMax / 10) * 10 || 100);

  // Gridlines & Y-Axis
  const gridSteps = 4;
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "right";

  for (let i = 0; i <= gridSteps; i++) {
    const val = Math.round((maxVal / gridSteps) * i);
    const y = currentY + chartHeight - (chartHeight / gridSteps) * i;
    ctx.fillText(`${val}${options.unit ?? ""}`, paddingLeft - 8, y + 3);

    ctx.strokeStyle = i === 0 ? "#CBD5E1" : "#F1F5F9";
    ctx.lineWidth = i === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(paddingLeft + chartWidth, y);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  const catCount = options.categories.length;
  const groupWidth = chartWidth / Math.max(catCount, 1);
  const seriesCount = options.series.length;
  const barGap = 4;
  const barWidth = Math.min(Math.max((groupWidth - 16) / seriesCount, 12), 48);

  options.categories.forEach((cat, catIdx) => {
    const groupStartX = paddingLeft + catIdx * groupWidth + (groupWidth - (barWidth * seriesCount + barGap * (seriesCount - 1))) / 2;

    options.series.forEach((s, sIdx) => {
      const val = s.data[catIdx] ?? 0;
      const barH = (val / maxVal) * chartHeight;
      const x = groupStartX + sIdx * (barWidth + barGap);
      const y = currentY + chartHeight - barH;

      if (barH > 0) {
        drawRoundedRect(ctx, x, y, barWidth, barH, 4, s.color);
        // Value label on bar
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#1E293B";
        const valText = `${val}${options.unit ?? ""}`;
        ctx.fillText(valText, x + barWidth / 2, Math.max(y - 4, currentY + 10));
      }
    });

    // Category Label below X axis
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#475569";
    const labelX = paddingLeft + catIdx * groupWidth + groupWidth / 2;
    const truncatedCat = cat.length > 14 ? `${cat.slice(0, 12)}…` : cat;
    ctx.fillText(truncatedCat, labelX, currentY + chartHeight + 18);
  });

  return canvas.toDataURL("image/png");
}

/**
 * Generates a crisp Donut / Pie Chart PNG data URL.
 */
export function generateDonutChartPng(options: DonutChartOptions): string {
  const width = options.width ?? 520;
  const height = options.height ?? 300;
  const { canvas, ctx } = createCrispCanvas(width, height);

  // Background card
  drawRoundedRect(ctx, 0, 0, width, height, 12, "#FFFFFF", "#E2E8F0", 1);

  let currentY = 16;
  if (options.title) {
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#0F172A";
    ctx.fillText(options.title, 20, currentY + 12);
    currentY += 36;
  } else {
    currentY += 12;
  }

  const total = options.slices.reduce((sum, s) => sum + s.value, 0);
  const centerX = width * 0.35;
  const centerY = currentY + (height - currentY - 20) / 2;
  const outerRadius = Math.min(width * 0.24, (height - currentY - 30) / 2);
  const innerRadius = outerRadius * 0.62;

  let startAngle = -Math.PI / 2;

  options.slices.forEach((slice) => {
    const sliceAngle = total > 0 ? (slice.value / total) * (2 * Math.PI) : 0;
    const endAngle = startAngle + sliceAngle;

    if (sliceAngle > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();

      ctx.fillStyle = slice.color;
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    startAngle = endAngle;
  });

  // Center Text inside donut
  if (options.centerText) {
    ctx.textAlign = "center";
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#0F172A";
    ctx.fillText(options.centerText, centerX, centerY + (options.centerSubtext ? -2 : 6));

    if (options.centerSubtext) {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#64748B";
      ctx.fillText(options.centerSubtext, centerX, centerY + 14);
    }
  }

  // Legend on right side
  const legendX = width * 0.62;
  let legendY = centerY - (options.slices.length * 28) / 2;

  options.slices.forEach((slice) => {
    const percentage = total > 0 ? Math.round((slice.value / total) * 100) : 0;

    drawRoundedRect(ctx, legendX, legendY, 12, 12, 3, slice.color);

    ctx.textAlign = "left";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#1E293B";
    ctx.fillText(`${slice.label}: `, legendX + 20, legendY + 10);

    const labelWidth = ctx.measureText(`${slice.label}: `).width;
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = slice.color;
    ctx.fillText(`${slice.value} (${percentage}%)`, legendX + 20 + labelWidth, legendY + 10);

    legendY += 28;
  });

  return canvas.toDataURL("image/png");
}

/**
 * Generates a crisp Line Chart PNG data URL.
 */
export function generateLineChartPng(options: LineChartOptions): string {
  const width = options.width ?? 600;
  const height = options.height ?? 300;
  const { canvas, ctx } = createCrispCanvas(width, height);

  // Background card
  drawRoundedRect(ctx, 0, 0, width, height, 12, "#FFFFFF", "#E2E8F0", 1);

  let currentY = 16;
  if (options.title) {
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#0F172A";
    ctx.fillText(options.title, 20, currentY + 12);
    currentY += 36;
  } else {
    currentY += 12;
  }

  const paddingLeft = 50;
  const paddingRight = 24;
  const paddingBottom = 45;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - currentY - paddingBottom;

  const maxVal = Math.max(...options.data, 100);
  const color = options.color ?? "#0F766E";

  // Gridlines & Y-Axis
  const gridSteps = 4;
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "right";

  for (let i = 0; i <= gridSteps; i++) {
    const val = Math.round((maxVal / gridSteps) * i);
    const y = currentY + chartHeight - (chartHeight / gridSteps) * i;
    ctx.fillText(`${val}${options.unit ?? ""}`, paddingLeft - 8, y + 3);

    ctx.strokeStyle = i === 0 ? "#CBD5E1" : "#F1F5F9";
    ctx.lineWidth = i === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(paddingLeft + chartWidth, y);
    ctx.stroke();
  }

  const stepX = chartWidth / Math.max(options.labels.length - 1, 1);
  const points: Array<{ x: number; y: number }> = options.labels.map((_, i) => ({
    x: paddingLeft + i * stepX,
    y: currentY + chartHeight - ((options.data[i] ?? 0) / maxVal) * chartHeight
  }));

  // Area Fill under line
  if (points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, currentY + chartHeight);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, currentY + chartHeight);
    ctx.closePath();
    ctx.fillStyle = `${color}1A`; // ~10% opacity fill
    ctx.fill();
  }

  // Line drawing
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw Dots and Value Labels
  ctx.textAlign = "center";
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Value text
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "#1E293B";
    ctx.fillText(`${options.data[i]}${options.unit ?? ""}`, p.x, p.y - 9);

    // Label below X axis
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#475569";
    const truncatedLabel = options.labels[i].length > 10 ? `${options.labels[i].slice(0, 9)}…` : options.labels[i];
    ctx.fillText(truncatedLabel, p.x, currentY + chartHeight + 18);
  });

  return canvas.toDataURL("image/png");
}

export interface KpiBadgeOptions {
  label: string;
  value: string;
  subtitle?: string;
  colorTheme?: "emerald" | "blue" | "amber" | "purple" | "rose";
  width?: number;
  height?: number;
}

/**
 * Generates a crisp KPI Metric Card PNG image data URL.
 */
export function generateKpiCardPng(options: KpiBadgeOptions): string {
  const width = options.width ?? 280;
  const height = options.height ?? 110;
  const { canvas, ctx } = createCrispCanvas(width, height);

  const themeColors = {
    emerald: { bg: "#F0FDF4", border: "#BBF7D0", text: "#166534", accent: "#15803D" },
    blue: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", accent: "#1D4ED8" },
    amber: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", accent: "#B45309" },
    purple: { bg: "#FAF5FF", border: "#E9D5FF", text: "#6B21A8", accent: "#7E22CE" },
    rose: { bg: "#FFF1F2", border: "#FECDD3", text: "#9F1239", accent: "#BE123C" }
  };

  const theme = themeColors[options.colorTheme ?? "emerald"];

  drawRoundedRect(ctx, 0, 0, width, height, 10, theme.bg, theme.border, 1.5);

  // Left accent bar
  drawRoundedRect(ctx, 0, 0, 6, height, 4, theme.accent);

  // Metric Label
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = theme.text;
  ctx.fillText(options.label.toUpperCase(), 16, 26);

  // Main Value
  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = "#0F172A";
  ctx.fillText(options.value, 16, 62);

  // Subtitle
  if (options.subtitle) {
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#64748B";
    ctx.fillText(options.subtitle, 16, 86);
  }

  return canvas.toDataURL("image/png");
}
