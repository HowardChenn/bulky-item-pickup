import { Injectable } from '@nestjs/common';
import type { PickupRequest } from '../pickup-requests/pickup-requests.repository.js';
import { matchDrivers } from './matching/match-drivers.js';

@Injectable()
export class PickupOffersService {
  selectOfferedDriverIds(
    pickup: PickupRequest,
    drivers: Parameters<typeof matchDrivers>[1],
    nearbyDriverIds?: ReadonlySet<string>,
  ): string[] {
    const offeredDriverIds = new Set<string>();

    for (const driver of matchDrivers(pickup, drivers, nearbyDriverIds)) {
      if (offeredDriverIds.size === 3) break;
      offeredDriverIds.add(driver.id);
    }

    return [...offeredDriverIds];
  }
}
