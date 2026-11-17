// Fake history for UI mockups. Not real git data.

export type Revision = {
  hash: string;
  author: string;
  date: string; // YYYY-MM-DD
  subject: string;
  added: number;
  removed: number;
  kind?: "binary" | "missing";
};

export const FILE_PATH = "internal/ratelimit/bucket.go";
export const BRANCH = "main";

export const revisions: Revision[] = [
  { hash: "a1f93c2", author: "Morgan Lee", date: "2025-03-02", subject: "Add token bucket rate limiter", added: 22, removed: 0 },
  { hash: "4be0d71", author: "Morgan Lee", date: "2025-03-09", subject: "Guard bucket with mutex", added: 4, removed: 0 },
  { hash: "9c27e5a", author: "Priya Shah", date: "2025-04-21", subject: "Make refill rate configurable", added: 6, removed: 2 },
  { hash: "e03b8f4", author: "Alex Vance", date: "2025-06-14", subject: "Add burst capacity option", added: 5, removed: 1 },
  { hash: "17d4a90", author: "Priya Shah", date: "2025-08-30", subject: "Refactor: extract refill()", added: 9, removed: 6 },
  { hash: "c58e2b3", author: "Jordan Kim", date: "2025-11-03", subject: "Use monotonic clock for refill", added: 3, removed: 3 },
  { hash: "0fa6d12", author: "Alex Vance", date: "2026-01-19", subject: "Expose Remaining() for metrics", added: 6, removed: 0 },
  { hash: "b7193ee", author: "Jordan Kim", date: "2026-03-27", subject: "Perf: skip lock on fast path", added: 7, removed: 2 },
  { hash: "5d2c0a8", author: "Morgan Lee", date: "2026-06-05", subject: "Fix negative tokens after clock skew", added: 3, removed: 1 },
  { hash: "e9b41f7", author: "Priya Shah", date: "2026-09-12", subject: "Add Wait(ctx) blocking acquire", added: 14, removed: 0 },
  { hash: "38aa6c5", author: "Alex Vance", date: "2026-11-02", subject: "Tune default burst to 2x rate", added: 1, removed: 1 },
];

// Each line exists from revision `from` (inclusive) until revision `to` (exclusive).
type Line = { text: string; from: number; to?: number };

const L = (from: number, text: string, to?: number): Line => ({ text, from, to });

const lines: Line[] = [
  L(0, "package ratelimit"),
  L(0, ""),
  L(0, "import ("),
  L(9, '\t"context"'),
  L(1, '\t"sync"'),
  L(0, '\t"time"'),
  L(0, ")"),
  L(0, ""),
  L(0, "// Bucket is a token bucket rate limiter."),
  L(0, "type Bucket struct {"),
  L(1, "\tmu       sync.Mutex"),
  L(0, "\ttokens   float64"),
  L(0, "\tcapacity float64", 3),
  L(3, "\tburst    float64"),
  L(0, "\trate     float64 // tokens per second", 2),
  L(2, "\trate     float64 // configurable via Options"),
  L(0, "\tlast     time.Time"),
  L(0, "}"),
  L(0, ""),
  L(2, "type Options struct {"),
  L(2, "\tRate  float64"),
  L(3, "\tBurst float64"),
  L(2, "}"),
  L(2, ""),
  L(0, "func New(rate float64) *Bucket {", 2),
  L(2, "func New(opts Options) *Bucket {"),
  L(3, "\tif opts.Burst == 0 {"),
  L(3, "\t\topts.Burst = opts.Rate", 10),
  L(10, "\t\topts.Burst = 2 * opts.Rate"),
  L(3, "\t}"),
  L(0, "\treturn &Bucket{tokens: rate, capacity: rate, rate: rate, last: time.Now()}", 2),
  L(2, "\treturn &Bucket{tokens: opts.Rate, burst: opts.Burst, rate: opts.Rate, last: time.Now()}"),
  L(0, "}"),
  L(0, ""),
  L(4, "func (b *Bucket) refill(now time.Time) {"),
  L(4, "\telapsed := now.Sub(b.last).Seconds()", 5),
  L(5, "\telapsed := now.Sub(b.last).Seconds() // monotonic"),
  L(8, "\tif elapsed < 0 {"),
  L(8, "\t\telapsed = 0"),
  L(8, "\t}"),
  L(4, "\tb.tokens = min(b.burst, b.tokens+elapsed*b.rate)"),
  L(4, "\tb.last = now"),
  L(4, "}"),
  L(4, ""),
  L(0, "// Allow reports whether one token is available and consumes it."),
  L(0, "func (b *Bucket) Allow() bool {"),
  L(7, "\tif b.tokens >= 1 && time.Since(b.last) < time.Millisecond {"),
  L(7, "\t\tb.tokens--"),
  L(7, "\t\treturn true"),
  L(7, "\t}"),
  L(1, "\tb.mu.Lock()"),
  L(1, "\tdefer b.mu.Unlock()"),
  L(0, "\tnow := time.Now()"),
  L(0, "\telapsed := now.Sub(b.last).Seconds()", 4),
  L(0, "\tb.tokens += elapsed * b.rate", 4),
  L(0, "\tif b.tokens > b.capacity {", 3),
  L(3, "\tif b.tokens > b.burst {", 4),
  L(0, "\t\tb.tokens = b.capacity", 3),
  L(3, "\t\tb.tokens = b.burst", 4),
  L(0, "\t}", 4),
  L(0, "\tb.last = now", 4),
  L(4, "\tb.refill(now)"),
  L(0, "\tif b.tokens < 1 {"),
  L(0, "\t\treturn false"),
  L(0, "\t}"),
  L(0, "\tb.tokens--"),
  L(0, "\treturn true"),
  L(0, "}"),
  L(6, ""),
  L(6, "// Remaining returns the current token count, for metrics."),
  L(6, "func (b *Bucket) Remaining() float64 {"),
  L(6, "\tb.mu.Lock()"),
  L(6, "\tdefer b.mu.Unlock()"),
  L(6, "\treturn b.tokens"),
  L(6, "}"),
  L(9, ""),
  L(9, "// Wait blocks until a token is available or ctx is done."),
  L(9, "func (b *Bucket) Wait(ctx context.Context) error {"),
  L(9, "\tfor {"),
  L(9, "\t\tif b.Allow() {"),
  L(9, "\t\t\treturn nil"),
  L(9, "\t\t}"),
  L(9, "\t\tselect {"),
  L(9, "\t\tcase <-ctx.Done():"),
  L(9, "\t\t\treturn ctx.Err()"),
  L(9, "\t\tcase <-time.After(time.Duration(float64(time.Second) / b.rate)):"),
  L(9, "\t\t}"),
  L(9, "\t}"),
  L(9, "}"),
];

export type ShownLine = { text: string; added: boolean };

export function contentAt(rev: number): ShownLine[] {
  return lines
    .filter((l) => l.from <= rev && (l.to === undefined || rev < l.to))
    .map((l) => ({ text: l.text.replaceAll("\t", "    "), added: l.from === rev && rev > 0 }));
}
