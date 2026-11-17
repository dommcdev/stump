import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, escapeControls } from "./guard";
import { FileHistory } from "./history";

test("control characters are escaped except tabs and newlines", () => {
  expect(escapeControls("a\tb\nc\x1b[31md\x07\r\n")).toBe("a\tb\nc\\x1b[31md\\x07\n");
});

test("NUL bytes or invalid UTF-8 are classified as binary", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  expect(classify(png, "logo.png")).toEqual({ kind: "binary", mime: "image/png", size: 9 });
  expect(classify(new Uint8Array([0xc3, 0x28]), "x.txt")).toMatchObject({ kind: "binary", mime: "application/octet-stream" });
  expect(classify(new TextEncoder().encode("héllo"), "x.txt")).toEqual({ kind: "text", text: "héllo" });
});

// A throwaway repo: a.txt has three revisions, then is renamed to b.txt, and has unstaged edits.
let dir: string;
const sh = (...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString();
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "stump-test-"));
  sh("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "one\n");
  sh("add", "."), sh("commit", "-qm", "first");
  writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
  sh("commit", "-qam", "second");
  sh("mv", "a.txt", "b.txt"), sh("commit", "-qm", "rename");
  writeFileSync(join(dir, "b.txt"), "one\ntwo\nthree\n");
  sh("commit", "-qam", "third");
  writeFileSync(join(dir, "b.txt"), "unstaged work\n");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("history follows renames and marks changed lines", async () => {
  const h = await FileHistory.open("b.txt", dir);
  expect(h.commits.map((c) => [c.subject, c.path])).toEqual([
    ["first", "a.txt"],
    ["second", "a.txt"],
    ["rename", "b.txt"],
    ["third", "b.txt"],
  ]);
  const second = await h.load(1);
  expect(second.ok && second.content).toEqual({ kind: "text", text: "one\ntwo\n" });
  expect(second.ok && [...second.changes.added]).toEqual([2]);
  const renamed = await h.load(2);
  expect(renamed.ok && renamed.changes.added.size).toBe(0);
  expect(h.clamp(-1)).toBe(0);
  expect(h.clamp(99)).toBe(3);
});

test("browsing history leaves working tree, index, and refs untouched", async () => {
  const file = join(dir, "b.txt");
  const index = join(dir, ".git", "index");
  const before = {
    content: readFileSync(file, "utf8"),
    mtime: statSync(file).mtimeMs,
    mode: statSync(file).mode,
    index: readFileSync(index),
    indexMtime: statSync(index).mtimeMs,
    refs: sh("show-ref", "--head"),
  };
  const h = await FileHistory.open("b.txt", dir);
  for (let i = 0; i < h.length; i++) await h.load(i);
  expect(readFileSync(file, "utf8")).toBe(before.content);
  expect(statSync(file).mtimeMs).toBe(before.mtime);
  expect(statSync(file).mode).toBe(before.mode);
  expect(readFileSync(index).equals(before.index)).toBe(true);
  expect(statSync(index).mtimeMs).toBe(before.indexMtime);
  expect(sh("show-ref", "--head")).toBe(before.refs);
});
