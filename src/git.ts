// Git adapter: runs read-only git commands and returns raw results.
// Nothing here may write to the working tree, index, or refs.

export class GitError extends Error {}

const ENV = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: "0", // never refresh/write the index as a side effect
  GIT_NO_LAZY_FETCH: "1", // partial clones: never fetch missing objects (C-03)
  GIT_TERMINAL_PROMPT: "0",
};

async function git(cwd: string, args: string[]): Promise<Uint8Array> {
  const proc = Bun.spawn(["git", "--no-optional-locks", "-c", "core.quotepath=off", ...args], {
    cwd,
    env: ENV,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new GitError(err.trim() || `git ${args[0]} exited with ${code}`);
  return out;
}

const gitText = async (cwd: string, args: string[]) => new TextDecoder().decode(await git(cwd, args));

export async function repoRoot(cwd: string): Promise<string> {
  try {
    return (await gitText(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new GitError(`not inside a git repository: ${cwd}`);
  }
}

export async function currentBranch(root: string): Promise<string> {
  try {
    const name = (await gitText(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    return name === "HEAD" ? "detached HEAD" : name;
  } catch {
    return "no commits";
  }
}

export type Commit = {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject: string;
  /** Path of the file as of this commit (differs from the current path across renames). */
  path: string;
  added: number | null; // null for binary changes
  removed: number | null;
};

const FS = "\x1f";
const RS = "\x1e";
const FORMAT = `--format=${RS}%H${FS}%h${FS}%an${FS}%ad${FS}%s`;

/** Commits that touched `path` (following renames), oldest first. */
export async function fileLog(root: string, path: string): Promise<Commit[]> {
  const base = ["log", "--follow", "--date=short", FORMAT];
  const [names, stats] = await Promise.all([
    gitText(root, [...base, "--name-only", "--", path]),
    gitText(root, [...base, "--numstat", "--", path]),
  ]);

  const counts = new Map<string, [number | null, number | null]>();
  for (const rec of stats.split(RS).slice(1)) {
    const [header, ...rest] = rec.split("\n");
    const line = rest.find((l) => l.includes("\t"));
    if (!line) continue;
    const [a, r] = line.split("\t");
    counts.set(header!.split(FS)[0]!, [a === "-" ? null : Number(a), r === "-" ? null : Number(r)]);
  }

  const commits: Commit[] = [];
  for (const rec of names.split(RS).slice(1)) {
    const lines = rec.split("\n").filter((l) => l.length > 0);
    const [hash, short, author, date, subject] = lines[0]!.split(FS) as [string, string, string, string, string];
    const [added, removed] = counts.get(hash) ?? [0, 0];
    commits.push({ hash, short, author, date, subject, path: lines.length > 1 ? lines.at(-1)! : path, added, removed });
  }
  return commits.reverse();
}

/** Raw blob bytes of `path` at `commit`. */
export async function readBlob(root: string, commit: string, path: string): Promise<Uint8Array> {
  try {
    return await git(root, ["cat-file", "blob", `${commit}:${path}`]);
  } catch (e) {
    const msg = (e as Error).message;
    if (/does not exist|exists on disk, but not in/.test(msg)) throw new GitError(`${path} does not exist at ${commit.slice(0, 7)}`);
    if (/Not a valid object name|bad object|missing/.test(msg)) {
      throw new GitError(`commit ${commit.slice(0, 7)} is not available locally (shallow or partial clone?)`);
    }
    throw new GitError(msg);
  }
}

export type LineChanges = {
  /** 1-based line numbers in the new file that this commit added or modified. */
  added: Set<number>;
  /** 1-based line numbers in the new file after which lines were removed. */
  removedAfter: Set<number>;
};

/** Lines changed by `commit` in `path` (compared with its first parent). */
export async function lineChanges(root: string, commit: string, path: string, oldPath: string): Promise<LineChanges> {
  const out = await gitText(root, [
    "diff", "--no-ext-diff", "--no-color", "-M", "-U0",
    `${commit}^`, commit, "--", ...new Set([oldPath, path]),
  ]).catch(() => "");
  // Including both paths lets -M pair a rename; only parse the patch for the new path.
  const changes: LineChanges = { added: new Set(), removedAfter: new Set() };
  let inTarget = false;
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ ")) inTarget = line === `+++ b/${path}`;
    if (!inTarget) continue;
    const m = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    const oldCount = m[1] === undefined ? 1 : Number(m[1]);
    const start = Number(m[2]);
    const newCount = m[3] === undefined ? 1 : Number(m[3]);
    for (let i = 0; i < newCount; i++) changes.added.add(start + i);
    if (newCount === 0 && oldCount > 0) changes.removedAfter.add(Math.max(1, start));
  }
  return changes;
}
