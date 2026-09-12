/* global console, process */

import { readFileSync, writeFileSync } from "node:fs";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node convert-copy-dump.mjs <source.sql> <destination.sql>");

const lines = readFileSync(source, "utf8").split(/\r?\n/u);
const output = ["begin;", "set session_replication_role = replica;", "set row_security = off;"];
let i = 0;
let tables = 0;
let rows = 0;

while (i < lines.length) {
  if (!lines[i].startsWith("COPY ")) { i += 1; continue; }
  const header = [lines[i++]];
  while (!header.at(-1).endsWith("FROM stdin;")) header.push(lines[i++]);
  const copyHeader = header.join(" ").replace(/\s+/gu, " ");
  const match = copyHeader.match(/^COPY (.+) FROM stdin;$/u);
  if (!match) throw new Error(`Could not parse COPY header: ${copyHeader}`);
  const target = match[1].replace(/\s+$/u, "");
  const skipTable = target.startsWith('"auth".') || target.startsWith('"storage"."buckets" ') || target.startsWith('"storage"."objects" ');
  tables += 1;
  while (i < lines.length && lines[i] !== "\\.") {
    const row = lines[i++];
    if (!row) continue;
    const values = row.split("\t").map((value) => {
      if (value === "\\N") return "null";
      const decoded = value.replace(/\\([\\tnrbf])/gu, (_, code) => ({ "\\": "\\", t: "\t", n: "\n", r: "\r", b: "\b", f: "\f" }[code] ?? code));
      return `'${decoded.replaceAll("'", "''")}'`;
    });
    if (!skipTable) {
      output.push(`insert into ${target} values (${values.join(",")});`);
      rows += 1;
    }
  }
  i += 1;
}

output.push("set session_replication_role = origin;", "commit;");
writeFileSync(destination, `${output.join("\n")}\n`, "utf8");
console.error(`Converted ${rows} rows across ${tables} tables.`);
