import { relative, resolve } from "node:path";

// Usage: bun run bench:git [repository] [absolute or repo-relative file]
let repo = resolve(process.argv[2] ?? ".");
async function git(...args: string[]) {
  const child = Bun.spawn(["git", "--no-pager", "-C", repo, ...args], {
    stdout: "pipe", stderr: "pipe",
  });
  const [bytes, error, code] = await Promise.all([
    new Response(child.stdout).bytes(), new Response(child.stderr).text(), child.exited,
  ]);
  if (code !== 0) throw new Error(error);
  return bytes;
}
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
repo = text(await git("rev-parse", "--show-toplevel")).trimEnd();
const input = process.argv[3] ?? text(await git("ls-files", "-z")).split("\0").find(Boolean);
if (!input || /[\r\n]/.test(input)) throw new Error("Pass a tracked file path without newlines.");
const file = relative(repo, resolve(repo, input));
if (!file || file === ".." || file.startsWith("../")) throw new Error("File must be inside the repository.");

// Include basic output-safety work in uncached timings, not just Git access.
function safeDisplay(bytes: Uint8Array): string {
  if (bytes.subarray(0, 8000).includes(0)) return `[binary: ${bytes.length} bytes]`;
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return `[binary: ${bytes.length} bytes]`; }
  return content.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
function report(label: string, times: number[]) {
  const sorted = times.toSorted((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!.toFixed(3);
  console.log(`${label.padEnd(28)} p50 ${percentile(0.5)} ms | p95 ${percentile(0.95)} ms | max ${percentile(1)} ms`);
}

console.log(`Repository: ${repo}\nFile: ${file}`);
const start = performance.now();
const commits = text(await git("log", "-2000", "--format=%H", "--no-renames", "HEAD", "--", file))
  .trim().split("\n").filter(Boolean);
console.log(`History discovery: ${(performance.now() - start).toFixed(2)} ms (${commits.length} revisions, capped at 2,000; no rename tracking)`);
if (!commits.length) throw new Error("No committed history for this file.");

// Traverse up to 100 distinct revisions before repeating to reach 100 samples.
const specs = Array.from({ length: 100 }, (_, i) => `${commits[i % Math.min(100, commits.length)]}:${file}`);
console.log(`100 reads per method; ${new Set(specs).size} distinct revisions.`);
const fresh: number[] = [];
const expected = new Map<string, string>();
for (const spec of specs) {
  const t = performance.now();
  const content = safeDisplay(await git("show", spec));
  fresh.push(performance.now() - t);
  expected.set(spec, content);
}
report("Fresh git show + safety", fresh);

const batch = Bun.spawn(["git", "-C", repo, "cat-file", "--batch"], {
  stdin: "pipe", stdout: "pipe", stderr: "pipe",
});
const stderr = new Response(batch.stderr).text();
const reader = batch.stdout.getReader();
let pending = Buffer.alloc(0);
async function fill() {
  const { value, done } = await reader.read();
  if (done) throw new Error("Git batch stream ended unexpectedly.");
  pending = Buffer.concat([pending, value]);
}
async function readObject(spec: string) {
  batch.stdin.write(`${spec}\n`);
  await batch.stdin.flush();
  while (!pending.includes(10)) await fill();
  const newline = pending.indexOf(10);
  const header = pending.subarray(0, newline).toString();
  pending = pending.subarray(newline + 1);
  const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
  if (!match) throw new Error(`Unexpected Git response: ${header}`);
  const size = Number(match[1]);
  while (pending.length < size + 1) await fill();
  const bytes = pending.subarray(0, size);
  pending = pending.subarray(size + 1);
  return bytes;
}
const cached = new Map<string, string>();
const persistent: number[] = [];
try {
  for (const spec of specs) {
    const t = performance.now();
    const content = safeDisplay(await readObject(spec));
    persistent.push(performance.now() - t);
    if (content !== expected.get(spec)) throw new Error(`Content mismatch: ${spec}`);
    cached.set(spec, content);
  }
} finally {
  batch.stdin.end();
  reader.releaseLock();
  batch.kill();
  await batch.exited;
  await stderr;
}
report("Persistent Git + safety", persistent);
const cacheTimes: number[] = [];
let chars = 0;
for (const spec of specs) {
  const t = performance.now();
  const content = cached.get(spec)!;
  chars += content.length;
  cacheTimes.push(performance.now() - t);
}
report("Cached safe text lookup", cacheTimes);
console.log(`Content checks passed; ${chars.toLocaleString()} characters read from cache.`);
console.log("Not an end-to-end UI benchmark: excludes highlighting/rendering. OS caches are NOT cleared; batch runs after fresh reads.");
