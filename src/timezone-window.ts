/**
 * Core question this module answers: given an instant in time and an IANA
 * timezone, what local wall-clock minute does it fall on, and does that
 * minute sit inside a given HH:MM-HH:MM window?
 *
 * This is deliberately not "instant + fixed UTC offset" arithmetic. A fixed
 * offset is only correct until the next DST transition in that zone, so any
 * cache of "America/New_York is UTC-5" silently goes wrong twice a year.
 * Intl.DateTimeFormat carries the full IANA rules, so asking it per-instant
 * is the only way to get this right without shipping a tz database.
 */

export interface TimeWindow {
  /** minutes since local midnight, 0-1439 */
  startMinutes: number;
  /** minutes since local midnight, 0-1439 */
  endMinutes: number;
}

const WINDOW_PATTERN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

export function parseWindow(spec: string): TimeWindow {
  const match = WINDOW_PATTERN.exec(spec.trim());
  if (!match) {
    throw new Error(`invalid window "${spec}", expected HH:MM-HH:MM`);
  }
  const [, startHour, startMinute, endHour, endMinute] = match;
  return {
    startMinutes: toMinutesOfDay(startHour, startMinute, spec),
    endMinutes: toMinutesOfDay(endHour, endMinute, spec),
  };
}

function toMinutesOfDay(hourStr: string, minuteStr: string, original: string): number {
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (hour > 23 || minute > 59) {
    throw new Error(`invalid window "${original}", hour/minute out of range`);
  }
  return hour * 60 + minute;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    // Throws RangeError for an unrecognized IANA zone name.
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// One formatter per timezone is enough; reuse across every call instead of
// building a new Intl.DateTimeFormat per timestamp in a hot streaming loop.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function localMinutesOfDay(instant: Date, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function isInWindow(instant: Date, timeZone: string, window: TimeWindow): boolean {
  const minutes = localMinutesOfDay(instant, timeZone);
  const { startMinutes, endMinutes } = window;

  if (startMinutes === endMinutes) {
    // Zero-width window: nothing is ever inside it.
    return false;
  }
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  // Window wraps past local midnight, e.g. 22:00-06:00.
  return minutes >= startMinutes || minutes < endMinutes;
}

/**
 * Accepts either an ISO 8601 string or an epoch-millisecond integer, since
 * both show up constantly in real log streams. Returns null rather than
 * throwing so a caller processing a stream can skip a bad line and continue.
 */
export function parseTimestamp(raw: string): Date | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  if (/^-?\d+$/.test(trimmed)) {
    const millis = Number(trimmed);
    return Number.isFinite(millis) ? new Date(millis) : null;
  }
  const instant = new Date(trimmed);
  return Number.isNaN(instant.getTime()) ? null : instant;
}
