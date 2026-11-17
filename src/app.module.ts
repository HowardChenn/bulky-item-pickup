import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PickupRequestsModule } from './pickup-requests/pickup-requests.module.js';
import { MockAvailabilityController } from './driver-availability/mock-availability.controller.js';

@Module({
  imports: [PickupRequestsModule],
  controllers: [AppController, MockAvailabilityController],
  providers: [AppService],
})
export class AppModule {}
