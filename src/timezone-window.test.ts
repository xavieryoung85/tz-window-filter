import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInWindow,
  isValidTimeZone,
  localMinutesOfDay,
  parseTimestamp,
  parseWindow,
} from './timezone-window.js';

// America/New_York, 2026: DST starts Sunday March 8 at 02:00 local (springs
// forward to 03:00, so 02:00-02:59 never occurs) and ends Sunday November 1
// at 02:00 EDT (falls back to 01:00, so 01:00-01:59 occurs twice).
const NY = 'America/New_York';
const SPRING_FORWARD_INSTANT = '2026-03-08T07:00:00Z'; // 02:00 EST -> 03:00 EDT
const FALL_BACK_INSTANT = '2026-11-01T06:00:00Z'; // 02:00 EDT -> 01:00 EST

test('localMinutesOfDay jumps across the spring-forward gap', () => {
  const beforeGap = new Date(new Date(SPRING_FORWARD_INSTANT).getTime() - 60_000);
  const atTransition = new Date(SPRING_FORWARD_INSTANT);

  assert.equal(localMinutesOfDay(beforeGap, NY), 1 * 60 + 59); // 01:59 EST
  assert.equal(localMinutesOfDay(atTransition, NY), 3 * 60); // 03:00 EDT
});

test('a window entirely inside the spring-forward gap matches nothing', () => {
  const window = parseWindow('02:00-03:00');
  const beforeGap = new Date(new Date(SPRING_FORWARD_INSTANT).getTime() - 60_000);
  const atTransition = new Date(SPRING_FORWARD_INSTANT);
  const afterGap = new Date(new Date(SPRING_FORWARD_INSTANT).getTime() + 60_000);

  assert.equal(isInWindow(beforeGap, NY, window), false); // 01:59, before window
  assert.equal(isInWindow(atTransition, NY, window), false); // 03:00, window end is exclusive
  assert.equal(isInWindow(afterGap, NY, window), false); // 03:01, past the window
});

test('localMinutesOfDay goes backward across the fall-back repeat', () => {
  const beforeFallBack = new Date(new Date(FALL_BACK_INSTANT).getTime() - 60_000);
  const atTransition = new Date(FALL_BACK_INSTANT);

  assert.equal(localMinutesOfDay(beforeFallBack, NY), 1 * 60 + 59); // 01:59 EDT
  assert.equal(localMinutesOfDay(atTransition, NY), 1 * 60); // 01:00 EST, second occurrence
});

test('a window covering the repeated hour matches both times it occurs', () => {
  const window = parseWindow('01:00-02:00');
  const firstOccurrence = new Date(new Date(FALL_BACK_INSTANT).getTime() - 60_000); // 01:59 EDT
  const secondOccurrence = new Date(FALL_BACK_INSTANT); // 01:00 EST

  assert.equal(isInWindow(firstOccurrence, NY, window), true);
  assert.equal(isInWindow(secondOccurrence, NY, window), true);
});

test('window wrapping past local midnight', () => {
  const window = parseWindow('22:00-06:00');
  assert.equal(isInWindow(new Date('2026-06-01T02:30:00-04:00'), NY, window), true); // 22:30
  assert.equal(isInWindow(new Date('2026-06-01T10:30:00-04:00'), NY, window), true); // 05:30
  assert.equal(isInWindow(new Date('2026-06-01T14:30:00-04:00'), NY, window), false); // 09:30
});

test('a zero-width window never matches', () => {
  const window = parseWindow('09:00-09:00');
  assert.equal(isInWindow(new Date('2026-06-01T13:00:00-04:00'), NY, window), false);
});

test('parseWindow rejects malformed and out-of-range specs', () => {
  assert.throws(() => parseWindow('9am-5pm'));
  assert.throws(() => parseWindow('25:00-04:00'));
  assert.throws(() => parseWindow('09:60-17:00'));
});

test('isValidTimeZone accepts real IANA zones and rejects garbage', () => {
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('Europe/Berlin'), true);
  assert.equal(isValidTimeZone('Not/AZone'), false);
});

test('parseTimestamp accepts ISO strings and epoch millis, rejects garbage', () => {
  assert.equal(parseTimestamp('2026-03-08T14:30:00-05:00')?.getTime(), new Date('2026-03-08T14:30:00-05:00').getTime());
  assert.equal(parseTimestamp('1770000000000')?.getTime(), 1770000000000);
  assert.equal(parseTimestamp('not a timestamp'), null);
  assert.equal(parseTimestamp(''), null);
});
