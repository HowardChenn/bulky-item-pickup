import { Injectable, Logger } from '@nestjs/common';
import { PickupMatchingWorker } from './pickup-matching.worker.js';

export type PickupRequestedEvent = {
  type: 'PickupRequested';
  eventId: string;
  pickupId: string;
  requestId: string;
};

@Injectable()
export class PickupEventStream {
  private readonly events: PickupRequestedEvent[] = [];
  private readonly logger = new Logger(PickupEventStream.name);
  private draining = false;

  constructor(private readonly worker: PickupMatchingWorker) {}

  publish(event: PickupRequestedEvent): void {
    this.events.push(event);
    this.logger.log({ action: 'event.published', ...event });

    if (this.draining) return;

    this.draining = true;
    setImmediate(() => {
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    try {
      while (true) {
        const event = this.events.shift();
        if (!event) break;

        try {
          await this.worker.handle(event);
        } catch (error) {
          this.logger.error({ action: 'event.failed', ...event, error });
        }
      }
    } finally {
      this.draining = false;
    }
  }
}