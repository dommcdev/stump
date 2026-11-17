import { pathToFiletype, RGBA, SyntaxStyle } from "@opentui/core";

export const theme = {
  bg: "#16181d",
  panel: "#1f2229",
  fg: "#c8ccd4",
  dim: "#5c6370",
  faint: "#3a3f4b",
  accent: "#e5a54b",
  hash: "#61afef",
  add: "#98c379",
  addBg: "#1e2a1e",
  addGutterBg: "#26361f",
  del: "#e06c75",
  warn: "#e5c07b",
};

export function createSyntaxStyle() {
  const c = RGBA.fromHex;
  return SyntaxStyle.fromStyles(
    {
      default: { fg: c(theme.fg) },
      keyword: { fg: c("#c678dd") },
      "keyword.import": { fg: c("#c678dd") },
      "keyword.operator": { fg: c("#c678dd") },
      string: { fg: c("#98c379") },
      comment: { fg: c("#7f848e"), italic: true },
      number: { fg: c("#d19a66") },
      boolean: { fg: c("#d19a66") },
      constant: { fg: c("#d19a66") },
      function: { fg: c("#61afef") },
      "function.call": { fg: c("#61afef") },
      "function.method.call": { fg: c("#61afef") },
      type: { fg: c("#e5c07b") },
      constructor: { fg: c("#e5c07b") },
      variable: { fg: c(theme.fg) },
      "variable.member": { fg: c("#e06c75") },
      property: { fg: c("#e06c75") },
      operator: { fg: c("#56b6c2") },
      punctuation: { fg: c("#abb2bf") },
      "markup.heading": { fg: c("#e06c75"), bold: true },
      "markup.raw": { fg: c("#98c379") },
      "markup.link": { fg: c("#61afef"), underline: true },
    },
  );
}

// Extensions OpenTUI doesn't map but parsers-config.ts has grammars for.
const EXTRA_FILETYPES: Record<string, string> = { nix: "nix", tf: "hcl", tfvars: "hcl", hcl: "hcl" };

/** Tree-sitter filetype for a path. Unknown or unavailable grammars fall back to plain text. */
export function filetypeFor(path: string): string | undefined {
  return pathToFiletype(path) ?? EXTRA_FILETYPES[path.split(".").pop()?.toLowerCase() ?? ""];
}
