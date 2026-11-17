#!/usr/bin/env bun
import { addDefaultParsers, createCliRenderer, getDataPaths } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { FileHistory } from "./history";
import parsers from "./parsers-config";
import { App } from "./ui/App";

const file = process.argv[2];
if (!file || file === "-h" || file === "--help") {
  console.error("usage: stump <file>");
  process.exit(file ? 0 : 1);
}

let history: FileHistory;
try {
  history = await FileHistory.open(file);
} catch (e) {
  console.error(`stump: ${(e as Error).message}`);
  process.exit(1);
}

// Grammars download on first use into ~/.local/share/stump/tree-sitter; offline → plain text.
getDataPaths().appName = "stump";
addDefaultParsers(parsers.parsers);

const renderer = await createCliRenderer({ exitOnCtrlC: true });
createRoot(renderer).render(<App history={history} />);
