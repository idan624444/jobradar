// Merge newly scanned jobs into site/jobs.json.
// Usage: node tools/merge.mjs <new-jobs.json | dir of job files> [--scanned N]
// Every field comes from scraped web pages, so it is validated and cleaned here
// before anything reaches the public site.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "jobs.json");
const KEEP_DAYS = 60;
const MAX_JOBS = 500;
const HOSTS = ["drushim.co.il", "alljobs.co.il", "indeed.com", "linkedin.com", "glassdoor.com", "glassdoor.co.il",
  "mploy.co.il", "secrettelaviv.com", "jobmaster.co.il", "taasiya.co.il", "builtin.com"];
const CATS = ["סושיאל", "שיווק דיגיטלי", "משרד פרסום", "תוכן ווידאו", "קמפיינים PPC", "שיווק כללי"];

const text = (v, n) => typeof v === "string"
  ? v.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n)
  : "";
const list = (a, k) => Array.isArray(a) ? a.map(x => text(x, 200)).filter(Boolean).slice(0, k) : [];
// Cover letters keep their line breaks; everything else is flattened to one line.
const letterText = v => typeof v === "string"
  ? v.replace(/<[^>]*>/g, "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
      .split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1200)
  : "";
// Each requirement from the posting, checked against Tehila's real background.
const REQ_STATES = ["met", "partial", "unmet", "unknown"];
const reqList = a => Array.isArray(a)
  ? a.map(r => r && typeof r === "object" ? { t: text(r.t, 120), must: r.must === true, s: REQ_STATES.includes(r.s) ? r.s : "unknown" } : null)
      .filter(r => r && r.t).slice(0, 10)
  : [];
const clampScore = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0; };
const isDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

function safeUrl(u) {
  try {
    const x = new URL(String(u));
    if (x.protocol !== "https:") return null;
    const h = x.hostname.toLowerCase();
    return HOSTS.some(s => h === s || h.endsWith("." + s)) ? x.href : null;
  } catch { return null; }
}

function clean(j) {
  if (!j || typeof j !== "object") return null;
  const id = String(j.id ?? "");
  const url = safeUrl(j.url);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || !url) return null;
  return {
    id, url,
    title: text(j.title, 160) || "משרה ללא כותרת",
    company: text(j.company, 80), city: text(j.city, 80),
    scope: text(j.scope, 40), mode: text(j.mode, 40), experience: text(j.experience, 40),
    category: CATS.includes(j.category) ? j.category : "שיווק כללי",
    source: text(j.source, 30),
    postedAt: isDate(j.postedAt) ? j.postedAt : "",
    foundAt: isDate(j.foundAt) ? j.foundAt : "",
    runId: text(j.runId, 20),
    foundTs: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(j.foundTs ?? "") ? j.foundTs : "",
    score: clampScore(j.score),
    reasons: list(j.reasons, 4), flags: list(j.flags, 3), tip: text(j.tip, 400),
    letter: letterText(j.letter),
    requirements: reqList(j.requirements),
  };
}

function readInput(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    return fs.readdirSync(p).filter(f => f.endsWith(".json"))
      .map(f => ({ id: path.basename(f, ".json"), ...JSON.parse(fs.readFileSync(path.join(p, f), "utf8")) }));
  }
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  return Array.isArray(data) ? data : data.jobs ?? [];
}

const [input, ...rest] = process.argv.slice(2);
if (!input) { console.error("usage: node tools/merge.mjs <new-jobs.json|dir> [--scanned N]"); process.exit(1); }
const scannedArg = rest.indexOf("--scanned");
const scanned = scannedArg >= 0 ? Math.max(0, parseInt(rest[scannedArg + 1], 10) || 0) : 0;

const current = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { jobs: [] };
const byId = new Map((current.jobs ?? []).map(clean).filter(Boolean).map(j => [j.id, j]));

const incoming = readInput(input);
let added = 0, rejected = 0, letters = 0, rescored = 0, runId = "";
for (const raw of incoming) {
  // An entry for a job we already have may fill in a missing cover letter,
  // or, with rescore: true, replace the score and the requirement check.
  const existing = raw && byId.get(String(raw.id ?? ""));
  if (existing) {
    const l = letterText(raw.letter);
    if (!existing.letter && l) { existing.letter = l; letters++; }
    if (raw.rescore === true) {
      existing.score = clampScore(raw.score);
      existing.requirements = reqList(raw.requirements);
      if (Array.isArray(raw.reasons)) existing.reasons = list(raw.reasons, 4);
      if (Array.isArray(raw.flags)) existing.flags = list(raw.flags, 3);
      rescored++;
    }
    continue;
  }
  const j = clean(raw);
  if (!j) { rejected++; continue; }
  if (byId.has(j.id)) continue;
  j.foundTs = new Date().toISOString();
  byId.set(j.id, j); added++;
  if (j.runId > runId) runId = j.runId;
}

const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
const jobs = [...byId.values()]
  .filter(j => !j.postedAt || j.postedAt >= cutoff)
  .sort((a, b) => (b.foundAt || "").localeCompare(a.foundAt || "") || b.score - a.score)
  .slice(0, MAX_JOBS);

const now = new Date();
// A letters-only backfill is not a scan, so it keeps the last scan's info.
const meta = !added && (letters || rescored) && current.meta ? current.meta : {
  lastRunId: runId || current.meta?.lastRunId || now.toISOString().slice(0, 10),
  lastRunAt: now.toISOString(),
  scanned: scanned || incoming.length,
  added,
};
fs.writeFileSync(OUT, JSON.stringify({ meta, jobs }, null, 1) + "\n");
console.log(`added ${added}, letters ${letters}, rescored ${rescored}, rejected ${rejected}, total ${jobs.length}, runId ${meta.lastRunId}`);
