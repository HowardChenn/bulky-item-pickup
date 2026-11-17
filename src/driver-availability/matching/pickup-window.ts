type TimeWindow = {
  windowStart: string;
  windowEnd: string;
};

export function coversPickupWindow(
  driver: TimeWindow,
  pickup: TimeWindow,
): boolean {
  return (
    Date.parse(driver.windowStart) <= Date.parse(pickup.windowStart) &&
    Date.parse(driver.windowEnd) >= Date.parse(pickup.windowEnd)
  );
}