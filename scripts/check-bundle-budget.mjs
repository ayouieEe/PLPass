import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

const distDirectory = resolve(process.cwd(), "dist");
const html = readFileSync(resolve(distDirectory, "index.html"), "utf8");
const references = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)"/g)]
  .map((match) => match[1])
  .filter((reference, index, all) => all.indexOf(reference) === index);

if (references.length === 0) {
  throw new Error("No initial JavaScript assets were found in dist/index.html. Run the production build first.");
}

const assets = references.map((reference) => {
  const filePath = resolve(distDirectory, reference.replace(/^\//, "").replace(/^assets\//, "assets/"));
  const contents = readFileSync(filePath);
  return {
    name: reference.split("/").at(-1),
    rawBytes: statSync(filePath).size,
    gzipBytes: gzipSync(contents).length
  };
});

const totals = assets.reduce(
  (result, asset) => ({ rawBytes: result.rawBytes + asset.rawBytes, gzipBytes: result.gzipBytes + asset.gzipBytes }),
  { rawBytes: 0, gzipBytes: 0 }
);
const budgets = { rawBytes: 800 * 1024, gzipBytes: 220 * 1024 };

const report = assets.map((asset) =>
  `${asset.name}: ${formatKilobytes(asset.rawBytes)} raw / ${formatKilobytes(asset.gzipBytes)} gzip`
);
report.push(`Initial JS total: ${formatKilobytes(totals.rawBytes)} raw / ${formatKilobytes(totals.gzipBytes)} gzip`);
report.push(`Budget: ${formatKilobytes(budgets.rawBytes)} raw / ${formatKilobytes(budgets.gzipBytes)} gzip`);
process.stdout.write(`${report.join("\n")}\n`);

if (totals.rawBytes > budgets.rawBytes || totals.gzipBytes > budgets.gzipBytes) {
  throw new Error("Initial JavaScript exceeds the configured capstone bundle budget.");
}

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
