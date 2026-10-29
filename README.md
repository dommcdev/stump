# react

Requires [Bun](https://bun.sh/) 1.3.0 or later.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun dev
```

To typecheck:

```bash
bun run typecheck
```

This project was created using `bun create tui`. [create-tui](https://github.com/msmps/create-tui) is the easiest way to get started with OpenTUI.

## Quick Git performance check

```bash
bun run bench:git                         # this repo, first tracked file
bun run bench:git /path/to/repo src/file.ts
bun run bench:git /path/to/repo /path/to/repo/src/file.ts
```

Measures history discovery and 100 revision reads using fresh Git processes,
a persistent `cat-file --batch` process, and cached safe text. Reports p50/p95/max
and checks that both Git methods return the same display content. Read timings
include binary detection and control-character escaping, but not UI rendering
or highlighting. OS caches are not cleared; batch reads run second. Use a real,
large repository: this starter's single commit cannot demonstrate scaling.

## Interactive history proof of concept

```bash
bun run poc /path/to/repo src/file.ts
bun run bench:ui /path/to/repo src/file.ts
```

The POC uses React/OpenTUI, a persistent Git reader, a 128-revision text cache,
and a visible-line viewport. Left/right (or h/l) scrub revisions; up/down and
Page Up/Down scroll; q quits. Long lines are clipped, tabs use four spaces,
and syntax highlighting is intentionally omitted. History is capped at 2,000
revisions at the same path, excluding deletions and without rename tracking.
The existing starter app is unchanged (`bun dev`).

`bench:ui` sends real mock keyboard input through the same React component and
waits for the native 120×40 frame to contain the loaded revision, at a 60 fps
cap. It tests up to 100 uncached older revisions, cached return navigation,
and a burst of 100 keys, followed by 50 more uncached keys at 5 ms intervals.
It checks visible source against Git and verifies scrolling. It does not measure a physical terminal emulator,
syntax highlighting, or cold disk caches. The final frame is saved to
`/tmp/opencode/stump-ui-frame.txt`.

Measured locally on Neovim (37,472 repository commits), `src/nvim/buffer.c`
(718 included file revisions, roughly 130 KB per revision):

| Measurement | Result |
| --- | --- |
| Initial history + first rendered content | 295 ms |
| Uncached key → native frame, p95 | 16.82 ms |
| Cached key → native frame, p95 | 16.74 ms |
| 100-key burst → final frame | 15.68 ms |
| Paced uncached scrubbing, last key → final frame | 9.86 ms |

These are one-machine observations, not guarantees. Rendering the entire file
instead of only visible lines initially measured about 65 ms p95: viewport
rendering mattered much more than Git subprocess overhead in this test.
