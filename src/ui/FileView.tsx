import { TextAttributes, type LineNumberRenderable, type LineSign, type ScrollBoxRenderable, type SyntaxStyle } from "@opentui/core";
import { useEffect, useRef, type RefObject } from "react";
import type { RevisionView } from "../history";
import { escapeInline } from "../guard";
import { filetypeFor, theme as C } from "./theme";

type Props = {
  view: RevisionView | null;
  path: string;
  hash: string;
  syntaxStyle: SyntaxStyle;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
};

export function FileView({ view, path, hash, syntaxStyle, scrollRef }: Props) {
  const gutterRef = useRef<LineNumberRenderable>(null);

  // Mark lines changed by the selected commit (0-based line indexes in the gutter API).
  useEffect(() => {
    const g = gutterRef.current;
    if (!g || !view?.ok) return;
    const colors = new Map<number, { gutter: string; content: string }>();
    const signs = new Map<number, LineSign>();
    for (const n of view.changes.added) {
      colors.set(n - 1, { gutter: C.addGutterBg, content: C.addBg });
      signs.set(n - 1, { after: "▎", afterColor: C.add });
    }
    for (const n of view.changes.removedAfter) {
      if (!signs.has(n - 1)) signs.set(n - 1, { after: "▁", afterColor: C.del });
    }
    g.setLineColors(colors);
    g.setLineSigns(signs);
  }, [view]);

  if (!view) return <box flexGrow={1} />;

  if (!view.ok) {
    return (
      <Centered>
        <text fg={C.del} attributes={TextAttributes.BOLD}>Can't show this revision</text>
        <text fg={C.fg}>{escapeInline(view.error)}</text>
        <text fg={C.dim}>Pick another revision with ←/→. Your working tree, index, and HEAD were not changed.</text>
      </Centered>
    );
  }

  if (view.content.kind === "binary") {
    return (
      <Centered>
        <text fg={C.warn} attributes={TextAttributes.BOLD}>Binary file — not displayed</text>
        <text fg={C.dim}>{escapeInline(path)} @ {hash.slice(0, 7)}</text>
        <text fg={C.fg}>{view.content.mime} · {view.content.size.toLocaleString()} bytes</text>
      </Centered>
    );
  }

  return (
    <scrollbox ref={scrollRef} flexGrow={1}>
      <line-number ref={gutterRef} fg={C.faint} minWidth={4} paddingRight={1}>
        <code content={view.content.text} filetype={filetypeFor(path)} syntaxStyle={syntaxStyle} fg={C.fg} wrapMode="none" conceal={false} />
      </line-number>
    </scrollbox>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
      {children}
    </box>
  );
}
