#!/usr/bin/env node
import { createInterface } from 'node:readline';
import {
  isInWindow,
  isValidTimeZone,
  parseTimestamp,
  parseWindow,
} from './timezone-window.js';

function printUsageAndExit(message?: string): never {
  if (message) {
    process.stderr.write(`${message}\n\n`);
  }
  process.stderr.write(
    'usage: tz-window-filter --tz <IANA timezone> --window <HH:MM-HH:MM> [--invert]\n\n' +
      'reads one timestamp per line from stdin (ISO 8601 or epoch milliseconds)\n' +
      'and writes to stdout the lines whose local time in --tz falls inside --window.\n\n' +
      'example:\n' +
      '  cat events.log | tz-window-filter --tz America/Chicago --window 09:00-17:00\n',
  );
  process.exit(message ? 1 : 0);
}

interface Args {
  timeZone: string;
  windowSpec: string;
  invert: boolean;
}

function parseArgs(argv: string[]): Args {
  let timeZone: string | undefined;
  let windowSpec: string | undefined;
  let invert = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--tz':
        timeZone = argv[++i];
        break;
      case '--window':
        windowSpec = argv[++i];
        break;
      case '--invert':
        invert = true;
        break;
      case '--help':
      case '-h':
        printUsageAndExit();
        break;
      default:
        printUsageAndExit(`unknown argument: ${arg}`);
    }
  }

  if (!timeZone) {
    printUsageAndExit('missing required --tz');
  }
  if (!windowSpec) {
    printUsageAndExit('missing required --window');
  }

  return { timeZone, windowSpec, invert };
}

async function main(): Promise<void> {
  const { timeZone, windowSpec, invert } = parseArgs(process.argv.slice(2));

  if (!isValidTimeZone(timeZone)) {
    printUsageAndExit(`unknown IANA time zone: ${timeZone}`);
  }

  const window = parseWindow(windowSpec);

  // readline consumes stdin one line at a time, so a multi-gigabyte log file
  // never has to sit in memory as a whole string or array of lines.
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

  let lineNumber = 0;
  let skipped = 0;

  for await (const line of lines) {
    lineNumber++;
    if (line.trim() === '') {
      continue;
    }

    const instant = parseTimestamp(line);
    if (instant === null) {
      skipped++;
      process.stderr.write(`line ${lineNumber}: could not parse timestamp, skipping\n`);
      continue;
    }

    const matches = isInWindow(instant, timeZone, window);
    if (matches !== invert) {
      process.stdout.write(`${line}\n`);
    }
  }

  if (skipped > 0) {
    process.stderr.write(`skipped ${skipped} unparseable line(s) out of ${lineNumber}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
