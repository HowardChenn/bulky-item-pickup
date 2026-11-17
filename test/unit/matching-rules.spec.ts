import { expect, test } from 'vitest';
import { fitsCargo } from '../../src/driver-availability/matching/cargo-fit.js';
import { coversPickupWindow } from '../../src/driver-availability/matching/pickup-window.js';

const tv = { widthCm: 156, heightCm: 90, depthCm: 10 };
const pickup = {
  windowStart: '2026-11-14T10:00:00+10:00',
  windowEnd: '2026-11-14T12:00:00+10:00',
};

test('a TV that exactly fits is accepted', () => {
  expect(fitsCargo(tv, { width: 156, height: 90, depth: 10 })).toBe(true);
});

test('a vehicle that is too narrow is rejected', () => {
  expect(fitsCargo(tv, { width: 120, height: 100, depth: 150 })).toBe(false);
});

test('a driver can cover the full window using UTC timestamps', () => {
  const driver = {
    windowStart: '2026-11-14T00:00:00Z',
    windowEnd: '2026-11-14T02:00:00Z',
  };

  expect(coversPickupWindow(driver, pickup)).toBe(true);
});

test('a driver who starts an hour late is rejected', () => {
  const driver = {
    windowStart: '2026-11-14T01:00:00Z',
    windowEnd: '2026-11-14T03:00:00Z',
  };

  expect(coversPickupWindow(driver, pickup)).toBe(false);
});