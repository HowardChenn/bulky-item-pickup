import { Injectable, Logger } from '@nestjs/common';
import { fetchSourceADrivers } from '../driver-availability/adapters/source-a.adapter.js';
import { fetchSourceBDrivers } from '../driver-availability/adapters/source-b.adapter.js';
import { findNearbyDriverIds } from '../driver-availability/matching/nearby-drivers.js';
import { PickupOffersService } from '../driver-availability/pickup-offers.service.js';
import type { PickupRequestedEvent } from './pickup-event-stream.js';
import { PickupRequestsRepository } from './pickup-requests.repository.js';

@Injectable()
export class PickupMatchingWorker {
  private readonly logger = new Logger(PickupMatchingWorker.name);

  constructor(
    private readonly repository: PickupRequestsRepository,
    private readonly offers: PickupOffersService,
  ) {}

  async handle({ pickupId, requestId }: PickupRequestedEvent): Promise<void> {
    const pickup = await this.repository.findById(pickupId);
    if (pickup?.matchingStatus !== 'PENDING') return;

    const baseUrl = `http://localhost:${process.env.PORT ?? 3000}`;
    const elasticsearchUrl = process.env.ELASTICSEARCH_URL;

    const [sourceA, sourceB, nearby] = await Promise.allSettled([
      this.fetchAndLog('source-a', requestId, pickupId, () =>
        fetchSourceADrivers(baseUrl),
      ),
      this.fetchAndLog('source-b', requestId, pickupId, () =>
        fetchSourceBDrivers(baseUrl),
      ),
      elasticsearchUrl
        ? findNearbyDriverIds(elasticsearchUrl, pickup.pickupSuburb)
        : Promise.resolve(undefined),
    ]);

    const matchingComplete =
      sourceA.status === 'fulfilled' &&
      sourceB.status === 'fulfilled' &&
      nearby.status === 'fulfilled';

    const drivers = [
      ...(sourceA.status === 'fulfilled' ? sourceA.value : []),
      ...(sourceB.status === 'fulfilled' ? sourceB.value : []),
    ];

    const offeredDriverIds = this.offers.selectOfferedDriverIds(
      pickup,
      drivers,
      nearby.status === 'fulfilled' ? nearby.value : new Set<string>(),
    );

    await this.repository.finishMatching(pickupId, matchingComplete, offeredDriverIds);
  }

  private async fetchAndLog<T>(
    source: string,
    requestId: string,
    pickupId: string,
    fetchDrivers: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    const fields = { event: 'availability.fetch', requestId, pickupId, source };

    try {
      const drivers = await fetchDrivers();
      this.logger.log({
        ...fields,
        latencyMs: Math.round(performance.now() - started),
        outcome: 'success',
      });
      return drivers;
    } catch (error) {
      this.logger.warn({
        ...fields,
        latencyMs: Math.round(performance.now() - started),
        outcome: error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : 'error',
      });
      throw error;
    }
  }
}