import { TextAttributes } from "@opentui/core";
import type { Commit } from "../git";
import { escapeInline } from "../guard";
import { theme as C } from "./theme";

const LABEL_W = 7; // "older " / "‹ 123 " etc., padded to a fixed width

/** Commit dots on a rail with a caret under the selection; windows around it when commits don't fit. */
export function Timeline({ commits, index, path, width }: { commits: Commit[]; index: number; path: string; width: number }) {
  const n = commits.length;
  const avail = Math.max(1, width - 2 - LABEL_W * 2);

  // Evenly spread if everything fits with at least one dash between dots; otherwise window around the selection.
  let start = 0;
  let count = n;
  let step = n > 1 ? Math.floor((avail - 1) / (n - 1)) : 1;
  if (n > 1 && step < 2) {
    step = 2;
    count = Math.floor((avail - 1) / 2) + 1;
    start = Math.max(0, Math.min(n - count, index - Math.floor(count / 2)));
  }
  const end = start + count;

  const segs: { s: string; fg: string }[] = [];
  for (let i = start; i < end; i++) {
    segs.push({ s: i === index ? "◆" : "●", fg: i === index ? C.accent : i < index ? C.fg : C.dim });
    if (i < end - 1) segs.push({ s: "─".repeat(step - 1), fg: i < index ? C.fg : C.faint });
  }

  const left = (start > 0 ? `‹ ${start}` : "older").padEnd(LABEL_W);
  const right = (end < n ? `${n - end} ›` : "newer").padStart(LABEL_W);
  const caret = " ".repeat(LABEL_W + (index - start) * step) + "▲";

  const c = commits[index]!;
  const stat =
    c.added === null ? <span fg={C.dim}>binary</span> : (
      <>
        <span fg={C.add}>+{c.added}</span> <span fg={C.del}>−{c.removed}</span>
      </>
    );

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} borderStyle="single" border={["bottom"]} borderColor={C.faint} flexShrink={0}>
      <text wrapMode="none">
        <span fg={C.dim}>{left}</span>
        {segs.map((g, i) => (
          <span key={i} fg={g.fg}>{g.s}</span>
        ))}
        <span fg={C.dim}>{right}</span>
      </text>
      <text fg={C.accent} wrapMode="none">{caret}</text>
      <text fg={C.fg} wrapMode="none">
        <span fg={C.hash}>{c.short}</span>
        <span fg={C.dim}>  {c.date}  </span>
        <span>{escapeInline(c.author)}</span>
        <span fg={C.dim}>  │  {index + 1}/{n}  │  </span>
        {stat}
        <span fg={C.dim}>  │  </span>
        <span attributes={TextAttributes.BOLD}>{escapeInline(c.subject)}</span>
        {c.path !== path && <span fg={C.warn}>  (as {escapeInline(c.path)})</span>}
      </text>
    </box>
  );
}
