import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { HistoryPoc } from "./poc-app";

const [repo, file] = process.argv.slice(2);
if (!repo || !file) {
  console.error("Usage: bun run poc /path/to/repo repo-relative-or-absolute-file");
  process.exit(1);
}
const renderer = await createCliRenderer({ targetFps: 60, maxFps: 60, exitOnCtrlC: true });
createRoot(renderer).render(<HistoryPoc repo={repo} file={file} />);
