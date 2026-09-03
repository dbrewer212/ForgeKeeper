import fs from "node:fs";
import path from "node:path";

const roots = ["src", path.join("src-tauri", "src")];
const extensions = new Set([".ts", ".tsx", ".rs"]);
const signals = [
  ["TODO", /\b(?:TODO|FIXME|HACK)\b/i],
  ["FUTURE", /\b(?:next pass|next phase|coming soon|will be enabled|will be added)\b/i],
  ["INCOMPLETE", /\b(?:not implemented|unimplemented|placeholder|stubbed?|temporary implementation)\b/i],
  ["SILENT_FAILURE", /catch\s*\(\s*\(\)\s*=>\s*undefined\s*\)/i],
  ["ALERT_ONLY", /window\.alert\s*\(/i],
  ["PLATFORM_BOUNDARY", /currently (?:implemented|available|supported) (?:for|on)|only works (?:in|on)|not available on/i],
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...walk(absolute));
    } else if (extensions.has(path.extname(entry.name)) && !/\.(?:test|spec)\.[^.]+$/i.test(entry.name)) {
      output.push(absolute);
    }
  }
  return output;
}

const findings = [];
for (const file of roots.flatMap(walk)) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of signals) {
      if (pattern.test(line)) {
        findings.push({ file: file.replaceAll("\\", "/"), line: index + 1, label, text: line.trim() });
      }
    }
  });
}

console.log(`Operational audit: ${findings.length} signal(s)`);
for (const finding of findings) {
  console.log(`AUDIT|${finding.file}:${finding.line}|${finding.label}|${finding.text}`);
}

const actionable = findings.filter((finding) => ["TODO", "FUTURE", "INCOMPLETE", "SILENT_FAILURE"].includes(finding.label));
console.log(`Operational audit actionable signals: ${actionable.length}`);

// Discovery pass: report everything but do not fail CI. Once the known backlog is
// resolved, this script can become a regression gate with an explicit allowlist.
process.exit(0);
