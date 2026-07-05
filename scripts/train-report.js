#!/usr/bin/env node
// Replays TRAIN-mode feedback (train/*.jsonl) against the current heuristics and
// reports which items the heuristics now get right, which improved (routed to the
// LLM), and which are still misclassified. See train/README.md for the workflow.

const fs = require('node:fs');
const path = require('node:path');

// For a false negative the goal is 'hit'; for a false positive the goal is 'miss'.
// 'ambiguous' counts as improved: the LLM gets to decide instead of the heuristics
// being flatly wrong.
function categorize(label, currentVerdict) {
  if (label === 'false_negative') {
    if (currentVerdict === 'hit') return 'fixed';
    if (currentVerdict === 'ambiguous') return 'improved';
    return 'open';
  }
  if (label === 'false_positive') {
    if (currentVerdict === 'miss') return 'fixed';
    if (currentVerdict === 'ambiguous') return 'improved';
    return 'open';
  }
  return null;
}

function buildReport(records, classifyFn) {
  const report = { fixed: [], improved: [], open: [] };
  for (const rec of records) {
    if (!rec || typeof rec.prompt !== 'string') continue;
    const result = classifyFn(rec.prompt);
    const bucket = categorize(rec.label, result.verdict);
    if (!bucket) continue;
    report[bucket].push({
      label: rec.label,
      prompt: rec.prompt,
      recordedVerdict: rec.verdict || null,
      currentVerdict: result.verdict,
      currentMatched: result.matched || []
    });
  }
  return report;
}

function loadRecords(trainDir) {
  if (!fs.existsSync(trainDir)) return [];
  const records = [];
  for (const file of fs.readdirSync(trainDir).filter((f) => f.endsWith('.jsonl')).sort()) {
    const lines = fs.readFileSync(path.join(trainDir, file), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch (e) {
        console.warn(`skipping malformed line in ${file}`);
      }
    }
  }
  return records;
}

function printSection(title, entries) {
  console.log(`\n${title} (${entries.length})`);
  for (const e of entries) {
    const excerpt = e.prompt.replace(/\n/g, ' \\n ').slice(0, 100);
    console.log(`  [${e.label}] now=${e.currentVerdict} ${e.currentMatched.length ? '(' + e.currentMatched.join(', ').slice(0, 50) + ')' : ''}`);
    console.log(`    "${excerpt}${e.prompt.length > 100 ? '…' : ''}"`);
  }
}

function main() {
  const { classifyPromptHeuristically } = require('../src/heuristics.js');
  const trainDir = path.join(__dirname, '..', 'train');
  const records = loadRecords(trainDir);
  if (records.length === 0) {
    console.log('No feedback found. Export a JSONL from the extension popup into train/.');
    return;
  }
  const report = buildReport(records, classifyPromptHeuristically);
  console.log(`Replayed ${records.length} feedback records against current heuristics.`);
  printSection('STILL WRONG — fix these', report.open);
  printSection('IMPROVED — now routed to LLM', report.improved);
  printSection('FIXED — heuristics now correct', report.fixed);
  if (report.open.length > 0) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { buildReport, categorize, loadRecords };
