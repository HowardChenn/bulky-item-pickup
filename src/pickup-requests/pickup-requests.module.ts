import { Module } from '@nestjs/common';
import { PickupRequestsController } from './pickup-requests.controller.js';
import { PickupRequestsService } from './pickup-requests.service.js';
import { PickupRequestsRepository } from './pickup-requests.repository.js';
import { PickupOffersService } from '../driver-availability/pickup-offers.service.js';
import { DriverInboxRepository } from '../driver-availability/inbox/driver-inbox.repository.js';
import { DriverInboxController } from '../driver-availability/inbox/driver-inbox.controller.js';
import { PickupEventStream } from './pickup-event-stream.js';
import { PickupMatchingWorker } from './pickup-matching.worker.js';

@Module({
  controllers: [
    PickupRequestsController,
    DriverInboxController
  ],
  providers: [
    PickupRequestsService, 
    PickupRequestsRepository, 
    PickupOffersService, 
    DriverInboxRepository,
    PickupEventStream,
    PickupMatchingWorker
  ],
})
export class PickupRequestsModule {}
