import { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { PocHistory, safeText } from "./poc-history";

export function HistoryPoc({ repo, file }: { repo: string; file: string }) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const rows = Math.max(1, height - 4);
  const [top, setTop] = useState(0);
  const [history, setHistory] = useState<PocHistory>();
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<{ index: number; content: string; cached: boolean; ms: number }>();
  const [error, setError] = useState("");
  const generation = useRef(0);
  const lines = useMemo(() => view?.content.split("\n") ?? [], [view?.content]);
  // Hand the renderer only visible rows, not thousands of offscreen lines.
  const visible = lines.slice(top, top + rows).map(line => line.replaceAll("\t", "    ").slice(0, width)).join("\n");

  useEffect(() => {
    let disposed = false;
    let reader: PocHistory | undefined;
    const close = () => { disposed = true; reader?.close(); };
    renderer.on("destroy", close);
    PocHistory.open(repo, file).then(h => {
      reader = h;
      if (disposed) h.close();
      else setHistory(h);
    }).catch(e => { if (!disposed) setError(String(e)); });
    return () => { close(); renderer.off("destroy", close); };
  }, [repo, file, renderer]);

  useEffect(() => {
    if (!history) return;
    const request = ++generation.current;
    history.load(index).then(result => {
      if (request === generation.current) { setView({ index, ...result }); setError(""); }
    }).catch(e => { if (request === generation.current) setError(String(e)); });
    return () => { generation.current++; };
  }, [history, index]);

  useKeyboard(key => {
    if (key.name === "q" || key.name === "escape") renderer.destroy();
    if (!history) return;
    if (key.name === "up" || key.name === "k") setTop(t => Math.max(0, t - 1));
    if (key.name === "down" || key.name === "j") setTop(t => Math.min(Math.max(0, lines.length - rows), t + 1));
    if (key.name === "pageup") setTop(t => Math.max(0, t - rows));
    if (key.name === "pagedown") setTop(t => Math.min(Math.max(0, lines.length - rows), t + rows));
    if (key.name === "left" || key.name === "h") setIndex(i => Math.min(history.commits.length - 1, i + 1));
    if (key.name === "right" || key.name === "l") setIndex(i => Math.max(0, i - 1));
  });

  const clean = (value: string) => safeText(new TextEncoder().encode(value));
  return <box flexDirection="column" flexGrow={1} backgroundColor="#171d26">
    <text fg="#f0ae65" height={1}>{`Stump POC  ${clean(history?.file ?? file)}`}</text>
    <text fg="#b6c3d5" height={1}>{history
      ? `${history.commits.length} revisions | history ${history.discoveryMs.toFixed(1)} ms | selected ${index + 1}`
      : "Loading local history…"}</text>
    <text fg="#f0ae65" height={1}>{view
      ? `Ready ${view.index} ${history!.commits[view.index]!.slice(0, 12)} | ${view.cached ? "cache" : "Git"} ${view.ms.toFixed(2)} ms${view.index !== index ? " | loading selection…" : ""}`
      : "Loading revision…"}</text>
    <box flexGrow={1} overflow="hidden">
      <text fg="#dce2eb" content={visible} />
    </box>
    <text fg={error ? "#ff8585" : "#b6c3d5"} height={1}>{error ? clean(error) : `←/h older  →/l newer  ↑/↓ scroll  PgUp/PgDn  q quit | line ${top + 1}/${lines.length} | plain text`}</text>
  </box>;
}
