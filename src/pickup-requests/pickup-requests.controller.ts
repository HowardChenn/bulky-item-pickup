import { Body, Controller, Post, Get, Param, HttpCode, Res } from '@nestjs/common';
import { CreatePickupRequestDto } from './create-pickup-request.dto.js';
import { PickupRequestsService } from './pickup-requests.service.js';
import { ClaimPickupRequestDto } from './claim-pickup-request.dto.js';
import type { Response } from 'express';
import { randomUUID } from 'crypto';

@Controller('pickup-requests')
export class PickupRequestsController {
  constructor(private readonly service: PickupRequestsService) {}
  @Post()
  create(
    @Body() body: CreatePickupRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    return this.service.create(body, requestId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(@Param('id') id: string, @Body() body: ClaimPickupRequestDto) {
    return this.service.claim(id, body.driverId);
  }
}