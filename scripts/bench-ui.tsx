import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { HistoryPoc } from "../src/poc-app";
import { mkdir, writeFile } from "node:fs/promises";
import { safeText } from "../src/poc-history";

const [repo, file] = process.argv.slice(2);
if (!repo || !file) throw new Error("Usage: bun run bench:ui /path/to/repo path/to/file");
const setup = await createTestRenderer({ width: 120, height: 40, targetFps: 60, maxFps: 60 });
const root = createRoot(setup.renderer);
async function frameAt(index: number) {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const frame = setup.captureCharFrame();
    if (frame.includes(`Ready ${index} `) && !frame.includes("loading selection")) return frame;
    if (frame.includes("Error:")) throw new Error(frame);
    await Bun.sleep(1);
  }
  throw new Error(`Timed out at revision ${index}:\n${setup.captureCharFrame()}`);
}
function report(label: string, samples: number[]) {
  const sorted = samples.toSorted((a, b) => a - b);
  const p = (v: number) => sorted[Math.ceil(v * sorted.length) - 1]!.toFixed(2);
  console.log(`${label}: p50 ${p(.5)} ms | p95 ${p(.95)} ms | max ${p(1)} ms`);
}
try {
  const start = performance.now();
  root.render(<HistoryPoc repo={repo} file={file} />);
  const initial = await frameAt(0);
  console.log(`Initial history + first rendered content: ${(performance.now() - start).toFixed(2)} ms`);
  const count = Number(/(\d+) revisions/.exec(initial)?.[1]);
  const steps = Math.min(100, count - 1);
  if (steps < 1) throw new Error("Choose a file with at least two revisions.");
  for (const direction of ["left", "right"] as const) {
    const times: number[] = [];
    for (let i = 1; i <= steps; i++) {
      const target = direction === "left" ? i : steps - i;
      const start = performance.now();
      setup.mockInput.pressArrow(direction);
      await frameAt(target);
      times.push(performance.now() - start);
    }
    report(`${steps} ${direction === "left" ? "uncached older" : "cached newer"} key → frame`, times);
  }
  const startBurst = performance.now();
  for (let i = 0; i < steps; i++) setup.mockInput.pressArrow("left");
  let last = await frameAt(steps);
  console.log(`Burst of ${steps} keys → correct final frame: ${(performance.now() - startBurst).toFixed(2)} ms`);
  const paced = Math.min(50, count - steps - 1);
  let lastKey = 0;
  for (let i = 0; i < paced; i++) {
    if (i) await Bun.sleep(5);
    lastKey = performance.now();
    setup.mockInput.pressArrow("left");
  }
  if (paced) {
    last = await frameAt(steps + paced);
    console.log(`${paced} additional uncached keys at 5 ms intervals → final frame: ${(performance.now() - lastKey).toFixed(2)} ms after last key`);
  }
  // Independently confirm displayed source against a fresh Git read, outside timings.
  const sha = /Ready \d+ ([0-9a-f]+)/.exec(last)![1]!;
  const relativeFile = last.split("\n")[0]!.trim().replace(/^Stump POC  /, "");
  const child = Bun.spawn(["git", "-C", repo, "show", `${sha}:${relativeFile}`], { stdout: "pipe", stderr: "pipe" });
  const [bytes, error, exit] = await Promise.all([new Response(child.stdout).bytes(), new Response(child.stderr).text(), child.exited]);
  if (exit) throw new Error(error);
  const expectedLines = safeText(bytes).split("\n").slice(0, 36);
  const actualLines = last.split("\n").slice(3, 39);
  for (let i = 0; i < expectedLines.length; i++) {
    const expected = expectedLines[i]!.replaceAll("\t", "    ").slice(0, 120).trimEnd();
    if (actualLines[i]?.trimEnd() !== expected) throw new Error(`Displayed source mismatch on line ${i + 1}`);
  }
  setup.mockInput.pressArrow("down");
  const scrollDeadline = performance.now() + 2000;
  while (!setup.captureCharFrame().includes("line 2/") && performance.now() < scrollDeadline) await Bun.sleep(1);
  if (!setup.captureCharFrame().includes("line 2/")) throw new Error("Scroll input did not update viewport.");
  console.log("Visible source matches Git; scrolling works; rapid navigation landed on the requested revision.");
  await mkdir("/tmp/opencode", { recursive: true });
  await writeFile("/tmp/opencode/stump-ui-frame.txt", last);
  console.log(`120×40 React/OpenTUI native frames, 60 fps cap; ${count} file revisions. Captured /tmp/opencode/stump-ui-frame.txt`);
  console.log("Includes keys, Git, safety checks, React, layout, and native frames. Excludes terminal emulator/display and syntax highlighting. OS caches not cleared; 1 ms polling included.");
} finally {
  root.unmount();
  setup.renderer.destroy();
}
