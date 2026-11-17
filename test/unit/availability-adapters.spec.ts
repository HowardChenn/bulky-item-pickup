import { afterEach, expect, test, vi } from 'vitest';
import { fetchSourceADrivers } from '../../src/driver-availability/adapters/source-a.adapter.js';
import { fetchSourceBDrivers } from '../../src/driver-availability/adapters/source-b.adapter.js';

const baseUrl = 'http://localhost:3000';
const start = '2026-11-14T00:00:00Z';
const end = '2026-11-14T03:00:00Z';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('Source A unwraps the drivers array and keeps centimetres', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      drivers: [{
        driverId: 'driver-a',
        suburb: 'West End',
        availableFrom: start,
        availableUntil: end,
        cargoCm: { width: 180, height: 120, depth: 200 },
      }],
    }),
  );

  await expect(fetchSourceADrivers(baseUrl)).resolves.toEqual([{
    id: 'driver-a',
    suburb: 'West End',
    windowStart: start,
    windowEnd: end,
    cargoCm: { width: 180, height: 120, depth: 200 },
  }]);
});

test('Source B maps the shift and converts metres to centimetres', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json([{
      id: 'driver-b',
      location: 'New Farm',
      shift: { start, end },
      cargoMetres: { width: 1.2, height: 1, depth: 1.5 },
    }]),
  );

  await expect(fetchSourceBDrivers(baseUrl)).resolves.toEqual([{
    id: 'driver-b',
    suburb: 'New Farm',
    windowStart: start,
    windowEnd: end,
    cargoCm: { width: 120, height: 100, depth: 150 },
  }]);
});