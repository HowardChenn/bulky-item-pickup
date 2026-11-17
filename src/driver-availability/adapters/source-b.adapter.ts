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

export async function fetchSourceBDrivers(baseUrl: string) {
  const response = await fetch(`${baseUrl}/mock-availability/source-b`, {
    signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) {
    throw new Error(`Source B returned HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Source B response must be an array');
  }

  return payload.map((driver: unknown) => {
    if (!isRecord(driver)) {
      throw new Error('Source B driver must be an object');
    }
    
    const { id, location, shift, cargoMetres } = driver;

    if (
      !isRecord(shift) ||
      !isTimestamp(shift.start) ||
      !isTimestamp(shift.end) ||
      Date.parse(shift.end) <= Date.parse(shift.start)
    ) {
      throw new Error('Source B driver must have a valid availability window');
    }

    if (
      !isRecord(cargoMetres) ||
      !isPositiveNumber(cargoMetres.width) ||
      !isPositiveNumber(cargoMetres.height) ||
      !isPositiveNumber(cargoMetres.depth)
    ) {
      throw new Error('Source B driver must have positive cargo dimensions');
    }

    if (
      typeof id !== 'string' || id.trim() === '' ||
      typeof location !== 'string' || location.trim() === ''
    ) {
      throw new Error('Source B driver must have a nonblank ID and location');
    }

    return {
      id,
      suburb: location,
      windowStart: shift.start,
      windowEnd: shift.end,
      cargoCm: {
        width: cargoMetres.width * 100,
        height: cargoMetres.height * 100,
        depth: cargoMetres.depth * 100
      },
    };
  });
}