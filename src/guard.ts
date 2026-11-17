// Output guard: decides whether a blob is displayable and makes text safe for the terminal.

export type Classified = { kind: "text"; text: string } | { kind: "binary"; mime: string; size: number };

const decoder = new TextDecoder("utf-8", { fatal: true });

/** FR-04/FR-05: binary if a NUL appears in the first 8,000 bytes or the content is not valid UTF-8. */
export function classify(bytes: Uint8Array, path: string): Classified {
  const head = bytes.subarray(0, 8000);
  if (!head.includes(0)) {
    try {
      return { kind: "text", text: escapeControls(decoder.decode(bytes)) };
    } catch {
      // invalid UTF-8 → binary
    }
  }
  return { kind: "binary", mime: detectMime(bytes, path), size: bytes.length };
}

/** FR-06: show control characters as visible escapes, keeping tabs and line breaks. */
export function escapeControls(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, hex);
}

/** For single-line metadata (subjects, names, paths): escape every control character. */
export function escapeInline(text: string): string {
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, hex);
}

const hex = (c: string) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`;

const MAGIC: [number[], string][] = [
  [[0x89, 0x50, 0x4e, 0x47], "image/png"],
  [[0xff, 0xd8, 0xff], "image/jpeg"],
  [[0x47, 0x49, 0x46, 0x38], "image/gif"],
  [[0x25, 0x50, 0x44, 0x46], "application/pdf"],
  [[0x50, 0x4b, 0x03, 0x04], "application/zip"],
  [[0x1f, 0x8b], "application/gzip"],
  [[0x00, 0x61, 0x73, 0x6d], "application/wasm"],
  [[0x7f, 0x45, 0x4c, 0x46], "application/x-elf"],
];

const BY_EXT: Record<string, string> = {
  webp: "image/webp", ico: "image/x-icon", bmp: "image/bmp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm",
  tar: "application/x-tar", jar: "application/java-archive", so: "application/x-sharedlib",
};

export function detectMime(bytes: Uint8Array, path: string): string {
  for (const [sig, mime] of MAGIC) if (sig.every((b, i) => bytes[i] === b)) return mime;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? "application/octet-stream";
}
