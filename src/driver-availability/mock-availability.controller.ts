import { Controller, Get } from '@nestjs/common';

@Controller('mock-availability')
export class MockAvailabilityController {
  @Get('source-a')
  sourceA() {
    return {
      drivers: [
        {
          driverId: 'driver-a',
          suburb: 'West End',
          availableFrom: '2026-11-14T09:00:00+10:00',
          availableUntil: '2026-11-14T13:00:00+10:00',
          cargoCm: { width: 180, height: 120, depth: 200 },
        },
        {
          driverId: 'driver-c',
          suburb: 'South Brisbane',
          availableFrom: '2026-11-14T09:00:00+10:00',
          availableUntil: '2026-11-14T13:00:00+10:00',
          cargoCm: { width: 180, height: 120, depth: 200 },
        },
      ],
    };
  }

  @Get('source-b')
  sourceB() {
    return [
      {
        id: 'driver-b',
        location: 'New Farm',
        shift: {
          start: '2026-11-14T00:00:00Z',
          end: '2026-11-14T03:00:00Z',
        },
        cargoMetres: { width: 1.2, height: 1, depth: 1.5 },
      },
    ];
  }
}