import { fitsCargo } from './cargo-fit.js';
import { coversPickupWindow } from './pickup-window.js';

type Pickup = {
  pickupSuburb: string;
  windowStart: string;
  windowEnd: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
};

type Driver = {
  id: string;
  suburb: string;
  windowStart: string;
  windowEnd: string;
  cargoCm: { width: number; height: number; depth: number };
};

const nearbySuburbs = new Map<string, string[]>([
  ['West End', ['South Brisbane']],
  ['South Brisbane', ['West End']],
]);

export function matchDrivers(
  pickup: Pickup,
  drivers: Driver[],
  nearbyDriverIds?: ReadonlySet<string>,
): Driver[] {
  const neighbours = nearbySuburbs.get(pickup.pickupSuburb) ?? [];

  return drivers.filter((driver) => {
    const nearby = nearbyDriverIds
      ? nearbyDriverIds.has(driver.id)
      : driver.suburb === pickup.pickupSuburb ||
        neighbours.includes(driver.suburb);

    return nearby &&
      coversPickupWindow(driver, pickup) &&
      fitsCargo(pickup, driver.cargoCm);
  });
}