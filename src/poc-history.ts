import { relative, resolve } from "node:path";

export function safeText(bytes: Uint8Array): string {
  if (bytes.subarray(0, 8000).includes(0)) return `[binary: ${bytes.length} bytes]`;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return `[binary: ${bytes.length} bytes]`; }
  return text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

async function git(repo: string, ...args: string[]) {
  const p = Bun.spawn(["git", "--no-pager", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([
    new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited,
  ]);
  if (code) throw new Error(error);
  return output;
}

export class PocHistory {
  private process;
  private reader;
  private stderr;
  private pending = Buffer.alloc(0);
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<number, string>();
  private closed = false;

  private constructor(readonly repo: string, readonly file: string, readonly commits: string[], readonly discoveryMs: number) {
    this.process = Bun.spawn(["git", "-C", repo, "cat-file", "--batch"], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    this.reader = this.process.stdout.getReader();
    this.stderr = new Response(this.process.stderr).text();
  }

  static async open(repository: string, input: string) {
    const start = performance.now();
    const repo = (await git(resolve(repository), "rev-parse", "--show-toplevel")).trimEnd();
    const file = relative(repo, resolve(repo, input));
    if (!file || file === ".." || file.startsWith("../") || /[\r\n]/.test(file)) {
      throw new Error("Choose a file inside the repository, without newlines in its path.");
    }
    const commits = (await git(repo, "log", "-2000", "--format=%H", "--no-renames", "--diff-filter=AM", "HEAD", "--", file))
      .trim().split("\n").filter(Boolean);
    if (!commits.length) throw new Error("No local history found for this file.");
    return new PocHistory(repo, file, commits, performance.now() - start);
  }

  async load(index: number): Promise<{ content: string; cached: boolean; ms: number }> {
    const start = performance.now();
    const cached = this.cache.get(index);
    if (cached !== undefined) return { content: cached, cached: true, ms: performance.now() - start };
    const job = this.queue.then(async () => {
      if (this.closed) throw new Error("History reader closed.");
      const sha = this.commits[index];
      if (!sha) throw new Error("Revision out of range.");
      this.process.stdin.write(`${sha}:${this.file}\n`);
      await this.process.stdin.flush();
      const fill = async () => {
        const { value, done } = await this.reader.read();
        if (done) throw new Error("Git object reader stopped.");
        this.pending = Buffer.concat([this.pending, value]);
      };
      while (!this.pending.includes(10)) await fill();
      const end = this.pending.indexOf(10);
      const header = this.pending.subarray(0, end).toString();
      this.pending = this.pending.subarray(end + 1);
      const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
      if (!match) throw new Error(`Cannot read revision: ${header}`);
      const size = Number(match[1]);
      while (this.pending.length < size + 1) await fill();
      const content = safeText(this.pending.subarray(0, size));
      this.pending = this.pending.subarray(size + 1);
      this.cache.set(index, content);
      if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
      return { content, cached: false, ms: performance.now() - start };
    });
    this.queue = job.catch(() => {});
    return job;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.process.kill();
    void this.stderr;
  }
}
