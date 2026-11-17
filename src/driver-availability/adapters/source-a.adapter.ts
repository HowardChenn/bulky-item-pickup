import { isISO8601 } from 'class-validator';
const timestampWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    timestampWithOffset.test(value) &&
    isISO8601(value, { strict: true })
  );
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function fetchSourceADrivers(baseUrl: string) {
  const response = await fetch(`${baseUrl}/mock-availability/source-a`, {
    signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) {
    throw new Error(`Source A returned HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.drivers)) {
    throw new Error('Source A response must contain a drivers array');
  }

  return payload.drivers.map((driver: unknown) => {
    if (!isRecord(driver)) {
      throw new Error('Source A driver must be an object');
    }

    const { driverId, suburb, availableFrom, availableUntil, cargoCm } = driver;

    if (
      !isTimestamp(availableFrom) ||
      !isTimestamp(availableUntil) ||
      Date.parse(availableUntil) <= Date.parse(availableFrom)
    ) {
      throw new Error('Source A driver must have a valid availability window');
    }

    if (
      !isRecord(cargoCm) ||
      !isPositiveNumber(cargoCm.width) ||
      !isPositiveNumber(cargoCm.height) ||
      !isPositiveNumber(cargoCm.depth)
    ) {
      throw new Error('Source A driver must have positive cargo dimensions');
    }

    if (
      typeof driverId !== 'string' || driverId.trim() === '' ||
      typeof suburb !== 'string' || suburb.trim() === ''
    ) {
      throw new Error('Source A driver must have a nonblank ID and suburb');
    }

    return {
      id: driverId,
      suburb,
      windowStart: availableFrom,
      windowEnd: availableUntil,
      cargoCm: {
        width: cargoCm.width,
        height: cargoCm.height,
        depth: cargoCm.depth
      },
    };
  });
}