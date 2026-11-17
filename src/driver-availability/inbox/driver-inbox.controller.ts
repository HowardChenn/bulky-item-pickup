import { Controller, Get, Param } from '@nestjs/common';
import { DriverInboxRepository } from './driver-inbox.repository.js';

@Controller('drivers')
export class DriverInboxController {
  constructor(private readonly inbox: DriverInboxRepository) {}

  @Get(':driverId/inbox')
  list(@Param('driverId') driverId: string) {
    return this.inbox.listPickupIds(driverId);
  }
}