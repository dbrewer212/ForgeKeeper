import fs from "node:fs";
import path from "node:path";

const roots = ["src", path.join("src-tauri", "src")];
const extensions = new Set([".ts", ".tsx", ".rs"]);
const signals = [
  ["TODO", /\b(?:TODO|FIXME|HACK)\b/i],
  ["FUTURE", /\b(?:next pass|next phase|coming soon|will be enabled|will be added)\b/i],
  ["INCOMPLETE", /\b(?:not implemented|unimplemented|stubbed?|temporary implementation|placeholder implementation|placeholder behavior)\b/i],
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

const sourceFiles = roots.flatMap(walk);
const sourceText = new Map(sourceFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
const findings = [];
for (const [file, content] of sourceText) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of signals) {
      if (pattern.test(line)) {
        findings.push({ file: file.replaceAll("\\", "/"), line: index + 1, label, text: line.trim() });
      }
    }
  });
}

function usageCount(pattern, excludedFile) {
  let count = 0;
  for (const [file, content] of sourceText) {
    if (file.replaceAll("\\", "/") === excludedFile) continue;
    count += [...content.matchAll(pattern)].length;
  }
  return count;
}

const legacyHelpers = [
  {
    name: "openStlAsset",
    definitionFile: "src/state/useForgekeeperState.ts",
    usagePattern: /\b(?:state\.)?openStlAsset\s*\(/g,
  },
  {
    name: "openExternalTool",
    definitionFile: "src/state/useForgekeeperState.ts",
    usagePattern: /\b(?:state\.)?openExternalTool\s*\(/g,
  },
];

for (const helper of legacyHelpers) {
  const count = usageCount(helper.usagePattern, helper.definitionFile);
  console.log(`USAGE|${helper.name}|${count}|${count === 0 ? "legacy-unreferenced" : "active"}`);
}

console.log(`Operational audit: ${findings.length} signal(s)`);
for (const finding of findings) {
  console.log(`AUDIT|${finding.file}:${finding.line}|${finding.label}|${finding.text}`);
}

const actionable = findings.filter((finding) => ["TODO", "FUTURE", "INCOMPLETE"].includes(finding.label));
console.log(`Operational audit actionable signals: ${actionable.length}`);

// Discovery remains non-blocking while the final legacy call-site classification is being
// completed. The next pass can turn this into a hard gate once every active signal is zero.
process.exit(0);
