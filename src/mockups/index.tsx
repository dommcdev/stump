// Interactive UI mockups for the file view. Run: bun run mockups
// 1-4 switch layout · h/l or ←/→ scrub · g/G oldest/newest · j/k scroll · b binary demo · x error demo · q quit
import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { BRANCH, contentAt, FILE_PATH, revisions, type Revision } from "./data";

const C = {
  bg: "#16181d",
  panel: "#1f2229",
  fg: "#c8ccd4",
  dim: "#5c6370",
  faint: "#3a3f4b",
  accent: "#e5a54b",
  hash: "#61afef",
  add: "#98c379",
  addBg: "#1e2a1e",
  del: "#e06c75",
  warn: "#e5c07b",
};

const LAYOUTS = ["Rail", "Density", "Ribbon", "Scrubber"] as const;
type Demo = "text" | "binary" | "missing";

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s);

// ───────────────────────────── shared pieces ─────────────────────────────

function TitleBar({ layout }: { layout: number }) {
  return (
    <box flexDirection="row" height={1} backgroundColor={C.panel} paddingLeft={1} paddingRight={1}>
      <text fg={C.accent} attributes={TextAttributes.BOLD}>stump </text>
      <text fg={C.fg} flexGrow={1}>{FILE_PATH}</text>
      <text fg={C.dim}>
        ⎇ {BRANCH} · read-only · mockup {layout + 1}/{LAYOUTS.length} {LAYOUTS[layout]}
      </text>
    </box>
  );
}

function CommitLine({ rev, i }: { rev: Revision; i: number }) {
  return (
    <text fg={C.fg} wrapMode="none">
      <span fg={C.hash}>{rev.hash}</span>
      <span fg={C.dim}>  {rev.date}  </span>
      <span>{rev.author}</span>
      <span fg={C.dim}>  │  </span>
      <span attributes={TextAttributes.BOLD}>{rev.subject}</span>
      <span fg={C.dim}>  │  </span>
      <span fg={C.add}>+{rev.added}</span> <span fg={C.del}>−{rev.removed}</span>
      <span fg={C.dim}>  │  rev {i + 1} of {revisions.length}</span>
    </text>
  );
}

function FileView({ rev, scroll, height, demo, minimap }: { rev: number; scroll: number; height: number; demo: Demo; minimap?: boolean }) {
  const r = revisions[rev]!;
  if (demo === "binary") {
    return (
      <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <text fg={C.warn} attributes={TextAttributes.BOLD}>Binary file — not displayed</text>
        <text fg={C.dim}>assets/logo.png @ {r.hash}</text>
        <text fg={C.fg}>image/png · 48,213 bytes</text>
        <text fg={C.dim}>←/→ to pick another revision</text>
      </box>
    );
  }
  if (demo === "missing") {
    return (
      <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <text fg={C.del} attributes={TextAttributes.BOLD}>Commit 2f0c9d1 is not available locally</text>
        <text fg={C.fg}>This repository is a shallow clone; older history was not fetched.</text>
        <text fg={C.dim}>Run `git fetch --unshallow` outside stump, or pick another revision with ←/→.</text>
        <text fg={C.dim}>Your working tree, index, and HEAD were not changed.</text>
      </box>
    );
  }
  const all = contentAt(rev);
  const shown = all.slice(scroll, scroll + height);
  const gw = String(all.length).length;
  return (
    <box flexGrow={1} flexDirection="row">
      <box flexGrow={1} flexDirection="column">
        {shown.map((l, idx) => (
          <box key={idx} height={1} flexDirection="row" backgroundColor={l.added ? C.addBg : undefined}>
            <text fg={l.added ? C.add : C.faint} wrapMode="none">
              {String(scroll + idx + 1).padStart(gw + 1)} {l.added ? "▎" : " "}{" "}
            </text>
            <text fg={C.fg} wrapMode="none">{l.text}</text>
          </box>
        ))}
      </box>
      {minimap && <Minimap lines={all} scroll={scroll} height={height} />}
    </box>
  );
}

// Right-hand column: where this revision's changes are in the whole file, plus the viewport.
function Minimap({ lines, scroll, height }: { lines: { added: boolean }[]; scroll: number; height: number }) {
  const rows = Array.from({ length: height }, (_, row) => {
    const a = Math.floor((row * lines.length) / height);
    const b = Math.max(a + 1, Math.floor(((row + 1) * lines.length) / height));
    const changed = lines.slice(a, b).some((l) => l.added);
    const inView = a < scroll + height && b > scroll;
    return { changed, inView };
  });
  return (
    <box width={2} flexDirection="column">
      {rows.map((r, i) => (
        <text key={i} fg={r.changed ? C.add : C.faint} bg={r.inView ? C.panel : undefined} wrapMode="none">
          {r.changed ? "▐█" : r.inView ? " │" : "  "}
        </text>
      ))}
    </box>
  );
}

function StatusBar() {
  const k = (key: string, label: string) => (
    <>
      <span fg={C.accent}>{key}</span>
      <span fg={C.dim}> {label}   </span>
    </>
  );
  return (
    <box height={1} backgroundColor={C.panel} paddingLeft={1}>
      <text wrapMode="none">
        {k("←/→", "older/newer")}
        {k("g/G", "first/last")}
        {k("j/k", "scroll")}
        {k("t", "tree")}
        {k("1-4", "layout")}
        {k("b/x", "binary/error demo")}
        {k("q", "quit")}
      </text>
    </box>
  );
}

// ───────────────────────────── timeline variants ─────────────────────────────

// 1. Rail: evenly spaced commit dots on a line, caret + commit details below.
function RailTimeline({ rev, width }: { rev: number; width: number }) {
  const n = revisions.length;
  const usable = width - 14;
  const step = Math.max(2, Math.floor(usable / (n - 1)));
  const cells: { ch: string; fg: string }[] = [];
  revisions.forEach((_, i) => {
    cells.push({ ch: i === rev ? "◆" : "●", fg: i === rev ? C.accent : i < rev ? C.fg : C.dim });
    if (i < n - 1) cells.push({ ch: "─".repeat(step - 1), fg: i < rev ? C.fg : C.faint });
  });
  const caretPos = rev * step;
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} borderStyle="single" border={["bottom"]} borderColor={C.faint}>
      <box flexDirection="row" height={1}>
        <text fg={C.dim} wrapMode="none">older </text>
        <text wrapMode="none">
          {cells.map((c, i) => (
            <span key={i} fg={c.fg}>{c.ch}</span>
          ))}
        </text>
        <text fg={C.dim} wrapMode="none"> newer</text>
      </box>
      <text fg={C.accent} wrapMode="none">{" ".repeat(6 + caretPos)}▲</text>
      <CommitLine rev={revisions[rev]!} i={rev} />
    </box>
  );
}

// 2. Density: time-scaled columns, bar height = lines changed. Shows *when* the file churned.
const BARS = " ▁▂▃▄▅▆▇█";
function DensityTimeline({ rev, width }: { rev: number; width: number }) {
  const cols = width - 4;
  const t = (d: string) => new Date(d).getTime();
  const t0 = t(revisions[0]!.date);
  const t1 = t(revisions.at(-1)!.date);
  const colOf = (i: number) => Math.round(((t(revisions[i]!.date) - t0) / (t1 - t0)) * (cols - 1));
  const max = Math.max(...revisions.map((r) => r.added + r.removed));
  const levels = 2 * 8; // two rows tall
  const top: { ch: string; fg: string }[] = Array.from({ length: cols }, () => ({ ch: " ", fg: C.dim }));
  const bot: { ch: string; fg: string }[] = Array.from({ length: cols }, () => ({ ch: "·", fg: C.faint }));
  revisions.forEach((r, i) => {
    const c = colOf(i);
    const h = Math.max(1, Math.round(((r.added + r.removed) / max) * levels));
    const fg = i === rev ? C.accent : C.hash;
    bot[c] = { ch: BARS[Math.min(8, h)]!, fg };
    top[c] = { ch: h > 8 ? BARS[h - 8]! : " ", fg };
  });
  // axis: year labels at their position
  const axis = Array.from({ length: cols }, () => " ");
  for (const y of [2025, 2026]) {
    const c = Math.round(((t(`${y}-01-01`) - t0) / (t1 - t0)) * (cols - 1));
    const p = Math.max(0, Math.min(cols - 4, c));
    `${y}`.split("").forEach((ch, k) => (axis[p + k] = ch));
  }
  const caret = Array.from({ length: cols }, () => " ");
  caret[colOf(rev)] = "▲";
  const row = (cells: { ch: string; fg: string }[]) => (
    <text wrapMode="none">
      {cells.map((c, i) => (
        <span key={i} fg={c.fg}>{c.ch}</span>
      ))}
    </text>
  );
  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} borderStyle="single" border={["bottom"]} borderColor={C.faint}>
      {row(top)}
      {row(bot)}
      <text fg={C.accent} wrapMode="none">{caret.join("")}</text>
      <text fg={C.dim} wrapMode="none">{axis.join("")}</text>
      <CommitLine rev={revisions[rev]!} i={rev} />
    </box>
  );
}

// 3. Ribbon: commit cards in a horizontal strip, selected card centered.
function RibbonTimeline({ rev, width }: { rev: number; width: number }) {
  const cardW = 24;
  const fit = Math.max(1, Math.floor((width - 2) / cardW));
  let start = Math.max(0, rev - Math.floor(fit / 2));
  start = Math.min(start, Math.max(0, revisions.length - fit));
  const visible = revisions.slice(start, start + fit);
  return (
    <box flexDirection="row" height={5} paddingLeft={1}>
      {visible.map((r, k) => {
        const i = start + k;
        const sel = i === rev;
        return (
          <box
            key={r.hash}
            width={cardW}
            borderStyle={sel ? "double" : "rounded"}
            borderColor={sel ? C.accent : C.faint}
            flexDirection="column"
            paddingLeft={1}
            backgroundColor={sel ? C.panel : undefined}
          >
            <text wrapMode="none">
              <span fg={sel ? C.accent : C.hash}>{r.hash}</span>
              <span fg={C.dim}> {r.date.slice(2)}</span>
            </text>
            <text fg={sel ? C.fg : C.dim} wrapMode="none">{clip(r.subject, cardW - 3)}</text>
            <text wrapMode="none">
              <span fg={C.dim}>{pad(r.author.split(" ")[0]!, 8)}</span>
              <span fg={C.add}> +{r.added}</span>
              <span fg={C.del}> −{r.removed}</span>
            </text>
          </box>
        );
      })}
    </box>
  );
}

// 4. Scrubber: a media-player style slider with endpoint labels; minimap of changes on the right.
function ScrubberTimeline({ rev, width }: { rev: number; width: number }) {
  const r = revisions[rev]!;
  const first = revisions[0]!;
  const last = revisions.at(-1)!;
  const left = `${first.date} `;
  const right = ` ${last.date}  ● working tree (modified)`;
  const track = Math.max(10, width - left.length - right.length - 4);
  const pos = Math.round((rev / (revisions.length - 1)) * (track - 1));
  const ticks = new Set(revisions.map((_, i) => Math.round((i / (revisions.length - 1)) * (track - 1))));
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} borderStyle="single" border={["bottom"]} borderColor={C.faint}>
      <box flexDirection="row" height={1}>
        <text wrapMode="none">
          <span fg={C.dim}>{left}</span>
          {Array.from({ length: track }, (_, c) => (
            <span key={c} fg={c === pos ? C.accent : c < pos ? C.accent : C.faint}>
              {c === pos ? "█" : ticks.has(c) ? (c < pos ? "┿" : "┼") : c < pos ? "━" : "─"}
            </span>
          ))}
          <span fg={C.dim}> {last.date}  </span>
          <span fg={C.warn}>●</span>
          <span fg={C.dim}> working tree (modified)</span>
        </text>
      </box>
      <text wrapMode="none">
        <span fg={C.dim}>{" ".repeat(left.length + Math.max(0, pos - 8))}</span>
        <span fg={C.bg} bg={C.accent}> {r.hash} · {rev + 1}/{revisions.length} </span>
      </text>
      <text wrapMode="none">
        <span fg={C.fg} attributes={TextAttributes.BOLD}>{r.subject}</span>
        <span fg={C.dim}>  —  {r.author}, {r.date}  </span>
        <span fg={C.add}>+{r.added}</span> <span fg={C.del}>−{r.removed}</span>
        <span fg={C.dim}>   prev: {revisions[rev - 1]?.hash ?? "—"}   next: {revisions[rev + 1]?.hash ?? "—"}</span>
      </text>
    </box>
  );
}

// ───────────────────────────── app ─────────────────────────────

const HEADER_HEIGHT = [4, 6, 5, 4];

export function App({ initialLayout = 0, initialRev = revisions.length - 1 }: { initialLayout?: number; initialRev?: number }) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [layout, setLayout] = useState(initialLayout);
  const [rev, setRev] = useState(initialRev);
  const [scroll, setScroll] = useState(0);
  const [demo, setDemo] = useState<Demo>("text");

  const bodyHeight = Math.max(1, height - 2 - HEADER_HEIGHT[layout]!);
  const total = contentAt(rev).length;
  const maxScroll = Math.max(0, total - bodyHeight);
  const s = Math.min(scroll, maxScroll);

  useKeyboard((key) => {
    const n = key.name;
    if (n === "q" || n === "escape") renderer.destroy();
    else if (n === "left" || n === "h") setRev((r) => Math.max(0, r - 1));
    else if (n === "right" || n === "l") setRev((r) => Math.min(revisions.length - 1, r + 1));
    else if (n === "g" && !key.shift) setRev(0);
    else if (n === "g" && key.shift) setRev(revisions.length - 1);
    else if (n === "j" || n === "down") setScroll(Math.min(maxScroll, s + 1));
    else if (n === "k" || n === "up") setScroll(Math.max(0, s - 1));
    else if (n === "pagedown" || n === "space") setScroll(Math.min(maxScroll, s + bodyHeight));
    else if (n === "pageup") setScroll(Math.max(0, s - bodyHeight));
    else if (n === "b") setDemo((d) => (d === "binary" ? "text" : "binary"));
    else if (n === "x") setDemo((d) => (d === "missing" ? "text" : "missing"));
    else if (["1", "2", "3", "4"].includes(n)) setLayout(Number(n) - 1);
  });

  const Timeline = [RailTimeline, DensityTimeline, RibbonTimeline, ScrubberTimeline][layout]!;
  return (
    <box flexDirection="column" width={width} height={height} backgroundColor={C.bg}>
      <TitleBar layout={layout} />
      <box height={HEADER_HEIGHT[layout]} flexDirection="column">
        <Timeline rev={rev} width={width} />
      </box>
      <FileView rev={rev} scroll={s} height={bodyHeight} demo={demo} minimap={layout === 3} />
      <StatusBar />
    </box>
  );
}

if (import.meta.main) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App />);
}
