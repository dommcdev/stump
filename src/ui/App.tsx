import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { escapeInline } from "../guard";
import type { FileHistory, RevisionView } from "../history";
import { FileView } from "./FileView";
import { createSyntaxStyle, theme as C } from "./theme";
import { Timeline } from "./Timeline";

export function App({ history }: { history: FileHistory }) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [index, setIndex] = useState(history.length - 1);
  const [view, setView] = useState<RevisionView | null>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const syntaxStyle = useMemo(() => createSyntaxStyle(), []);
  useEffect(() => () => syntaxStyle.destroy(), [syntaxStyle]);

  // Load the selected revision; keep showing the previous one until it arrives, then prefetch neighbours.
  useEffect(() => {
    let current = true;
    history.load(index).then((v) => {
      if (!current) return;
      setView(v);
      history.load(history.clamp(index - 1));
      history.load(history.clamp(index + 1));
    });
    return () => {
      current = false;
    };
  }, [history, index]);

  useKeyboard((key) => {
    const page = Math.max(1, height - 7);
    const scroll = (d: number) => scrollRef.current?.scrollBy(d);
    const go = (i: number) => setIndex(history.clamp(i));
    switch (key.name) {
      case "q":
      case "escape":
        renderer.destroy();
        break;
      case "left":
      case "h":
        go(index - 1);
        break;
      case "right":
      case "l":
        go(index + 1);
        break;
      case "home":
        go(0);
        break;
      case "end":
        go(history.length - 1);
        break;
      case "g":
        go(key.shift ? history.length - 1 : 0);
        break;
      case "j":
      case "down":
        scroll(1);
        break;
      case "k":
      case "up":
        scroll(-1);
        break;
      case "d":
        if (key.ctrl) scroll(Math.floor(page / 2));
        break;
      case "u":
        if (key.ctrl) scroll(-Math.floor(page / 2));
        break;
      case "pagedown":
      case "space":
        scroll(page);
        break;
      case "pageup":
        scroll(-page);
        break;
    }
  });

  const commit = history.commits[index]!;
  return (
    <box flexDirection="column" width={width} height={height} backgroundColor={C.bg}>
      <box flexDirection="row" height={1} flexShrink={0} backgroundColor={C.panel} paddingLeft={1} paddingRight={1}>
        <text fg={C.accent}>stump </text>
        <text fg={C.fg} flexGrow={1} wrapMode="none">{escapeInline(history.path)}</text>
        <text fg={C.dim} wrapMode="none">⎇ {escapeInline(history.branch)} · read-only</text>
      </box>
      <Timeline commits={history.commits} index={index} path={history.path} width={width} />
      <FileView view={view} path={commit.path} hash={commit.hash} syntaxStyle={syntaxStyle} scrollRef={scrollRef} />
      <box height={1} flexShrink={0} backgroundColor={C.panel} paddingLeft={1}>
        <text wrapMode="none">
          <Key k="←/→" label="older/newer" />
          <Key k="g/G" label="oldest/newest" />
          <Key k="j/k" label="scroll" />
          <Key k="q" label="quit" />
        </text>
      </box>
    </box>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <>
      <span fg={C.accent}>{k}</span>
      <span fg={C.dim}> {label}   </span>
    </>
  );
}
