import { expect, test } from 'vitest';
import { matchDrivers } from '../../src/driver-availability/matching/match-drivers.js';
import { PickupOffersService } from '../../src/driver-availability/pickup-offers.service.js';
import type { PickupRequest } from '../../src/pickup-requests/pickup-requests.repository.js';

const pickup: PickupRequest = {
  id: 'tv',
  status: 'OPEN',
  matchingComplete: true,
  pickupSuburb: 'West End',
  dropoffSuburb: 'New Farm',
  windowStart: '2026-11-14T10:00:00+10:00',
  windowEnd: '2026-11-14T12:00:00+10:00',
  widthCm: 156,
  heightCm: 90,
  depthCm: 10,
};

const driver = {
  id: 'nearby',
  suburb: 'South Brisbane',
  windowStart: pickup.windowStart,
  windowEnd: pickup.windowEnd,
  cargoCm: { width: 180, height: 120, depth: 200 },
};

test('proximity excludes a distant driver with the same cargo and availability', () => {
  const distant = { ...driver, id: 'distant', suburb: 'New Farm' };
  expect(matchDrivers(pickup, [driver, distant])).toEqual([driver]);
});

test('offers go to at most three distinct eligible drivers in input order', () => {
  const ids = new PickupOffersService().selectOfferedDriverIds(pickup, [
    { ...driver, id: 'distant', suburb: 'New Farm' },
    ...['a', 'a', 'b', 'c', 'd'].map((id) => ({ ...driver, id })),
  ]);

  expect(ids).toEqual(['a', 'b', 'c']);
});
