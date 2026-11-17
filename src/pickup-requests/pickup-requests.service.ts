import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePickupRequestDto } from './create-pickup-request.dto.js';
import {
  PickupRequestsRepository,
  type PickupRequest,
} from './pickup-requests.repository.js';
import { DriverInboxRepository } from '../driver-availability/inbox/driver-inbox.repository.js';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PickupEventStream } from './pickup-event-stream.js';

@Injectable()
export class PickupRequestsService {
  constructor(
    private readonly repository: PickupRequestsRepository,
    private readonly inbox: DriverInboxRepository,
    private readonly events: PickupEventStream
  ) {}

  async create(body: CreatePickupRequestDto, requestId: string) {
    if (Date.parse(body.windowEnd) <= Date.parse(body.windowStart)) {
      throw new BadRequestException('Pickup window must end after it starts');
    }

    const pickup: PickupRequest = {
      ...body,
      id: randomUUID(),
      status: 'OPEN',
      matchingStatus: 'PENDING',
      matchingComplete: false,
    };

    await this.repository.save(pickup, []);

    this.events.publish({
      type: 'PickupRequested',
      eventId: randomUUID(),
      pickupId: pickup.id,
      requestId,
    });

    return {
      id: pickup.id,
      status: pickup.status,
      matchingStatus: pickup.matchingStatus,
      matchingComplete: pickup.matchingComplete,
    };
  }

  async findOne(id: string): Promise<PickupRequest> {
    const pickup = await this.repository.findById(id);

    if (pickup === undefined) {
      throw new NotFoundException('Pickup request not found');
    }

    return pickup;
  }

  async claim(pickupId: string, driverId: string) {
    await this.findOne(pickupId);

    if (!(await this.inbox.hasOffer(driverId, pickupId))) {
      throw new ForbiddenException('Driver was not offered this pickup');
    }

    try {
      await this.repository.claimIfOpen(pickupId, driverId);
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictException('This pickup has already been claimed');
      }
      throw error;
    }

    return { id: pickupId, status: 'CLAIMED', assignedDriverId: driverId };
  }
}
