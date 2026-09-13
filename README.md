# tz-window-filter

Answers one question: for a stream of timestamps, which ones fall inside a
given local time-of-day window (like "business hours") in a given timezone?

## Why this is harder than it looks

The tempting shortcut is to convert every timestamp to a fixed UTC offset for
a timezone and compare hours from there. That works until the next DST
transition, at which point the offset for `America/New_York` (say) silently
flips between UTC-5 and UTC-4 and every comparison near the boundary is off
by an hour. `tz-window-filter` never caches an offset. For every timestamp it
asks `Intl.DateTimeFormat`, which carries the full IANA timezone database
that ships with Node, what the local wall-clock time actually is at that
instant, then checks that against the window. No timezone data file needed,
no third-party library, and it's correct across every transition.

Windows that cross local midnight (`22:00-06:00` for an overnight shift) are
also handled correctly.

## Usage

Build once:

```
npx tsc -p tsconfig.json
```

Then pipe a stream of timestamps (one per line, ISO 8601 or epoch
milliseconds) through it:

```
$ printf '2026-03-08T06:30:00-05:00\n2026-03-08T14:30:00-05:00\n2026-03-08T21:00:00-05:00\n' \
    | node dist/cli.js --tz America/New_York --window 09:00-17:00
2026-03-08T14:30:00-05:00
```

Only the line whose New York local time falls between 09:00 and 17:00 is
kept. Add `--invert` to keep everything outside the window instead:

```
$ cat events.log | node dist/cli.js --tz Europe/Berlin --window 09:00-17:00 --invert
```

Because input is read with Node's `readline` interface line by line, a
multi-gigabyte log file streamed in over stdin is processed one line at a
time and never held in memory as a whole.

## Library usage

The matching logic is also exported directly, for use outside the CLI:

```ts
import { isInWindow, parseWindow } from './dist/timezone-window.js';

const window = parseWindow('09:00-17:00');
isInWindow(new Date('2026-03-08T14:30:00-05:00'), 'America/New_York', window); // true
```

## Status

Early skeleton: single-window filtering over a line-delimited stream. See
the roadmap in project notes for what's planned next (CSV column selection,
multi-window support, a proper test suite).
