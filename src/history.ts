// History service: tracks a file's revisions and turns a selection into git queries.
import { relative, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { currentBranch, fileLog, GitError, lineChanges, readBlob, repoRoot, type Commit, type LineChanges } from "./git";
import { classify, type Classified } from "./guard";

export type RevisionView =
  | { ok: true; content: Classified; changes: LineChanges }
  | { ok: false; error: string };

export class FileHistory {
  private cache = new Map<number, Promise<RevisionView>>();

  private constructor(
    readonly root: string,
    readonly path: string,
    readonly branch: string,
    readonly commits: Commit[],
  ) {}

  static async open(file: string, cwd = process.cwd()): Promise<FileHistory> {
    const root = await repoRoot(cwd);
    const path = relative(root, resolve(realpathSync(cwd), file));
    if (path.startsWith("..")) throw new GitError(`${file} is outside the repository at ${root}`);
    const [branch, commits] = await Promise.all([currentBranch(root), fileLog(root, path)]);
    if (commits.length === 0) throw new GitError(`${path} has no committed history`);
    return new FileHistory(root, path, branch, commits);
  }

  get length() {
    return this.commits.length;
  }

  /** Clamp a requested index to the available revisions (FR-10: stop at either endpoint). */
  clamp(i: number) {
    return Math.max(0, Math.min(this.commits.length - 1, i));
  }

  load(i: number): Promise<RevisionView> {
    let view = this.cache.get(i);
    if (!view) {
      view = this.fetch(i);
      this.cache.set(i, view);
    }
    return view;
  }

  private async fetch(i: number): Promise<RevisionView> {
    const c = this.commits[i]!;
    const prevPath = this.commits[i - 1]?.path ?? c.path;
    try {
      const [bytes, changes] = await Promise.all([
        readBlob(this.root, c.hash, c.path),
        i === 0 ? Promise.resolve({ added: new Set<number>(), removedAfter: new Set<number>() }) : lineChanges(this.root, c.hash, c.path, prevPath),
      ]);
      return { ok: true, content: classify(bytes, c.path), changes };
    } catch (e) {
      this.cache.delete(i); // allow retry
      return { ok: false, error: (e as Error).message };
    }
  }
}
