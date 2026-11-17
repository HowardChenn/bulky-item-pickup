import assert from 'node:assert/strict';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { dynamodb } from '../../src/dynamodb-client.js';
import { driverOffersTable } from '../../src/driver-availability/inbox/driver-inbox.repository.js';
import { MockAvailabilityController } from '../../src/driver-availability/mock-availability.controller.js';
import { PickupEventStream } from '../../src/pickup-requests/pickup-event-stream.js';
import { PickupMatchingWorker } from '../../src/pickup-requests/pickup-matching.worker.js';

export const tvPickup = {
  pickupSuburb: 'West End',
  dropoffSuburb: 'New Farm',
  windowStart: '2026-11-14T10:00:00+10:00',
  windowEnd: '2026-11-14T12:00:00+10:00',
  widthCm: 156,
  heightCm: 90,
  depthCm: 10,
};

const driverIds = ['driver-a', 'driver-b', 'driver-c'];

export function usePickupApi(slowSource?: 'source-a' | 'source-b') {
  let app: INestApplication | undefined;
  let originalPort: string | undefined;
  const pickupIds = new Set<string>();

  async function start() {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    if (slowSource) {
      const mocks = app.get(MockAvailabilityController);
      app.use(
        '/mock-availability/' + slowSource,
        (_req: Request, res: Response) => {
          const timer = setTimeout(() => {
            res.json(
              slowSource === 'source-a' ? mocks.sourceA() : mocks.sourceB(),
            );
          }, 1100);
          res.once('close', () => clearTimeout(timer));
        },
      );
    }

    await app.listen(0, '127.0.0.1');
    process.env.PORT = new URL(await app.getUrl()).port;
  }

  function api() {
    assert.ok(app);
    return request(app.getHttpServer());
  }

  beforeEach(async () => {
    originalPort = process.env.PORT;
    await start();
  });

  afterEach(async () => {
    try {
      await Promise.all(
        [...pickupIds].flatMap((id) => [
          dynamodb.send(
            new DeleteCommand({ TableName: 'PickupRequests', Key: { id } }),
          ),
          ...driverIds.map((driverId) =>
            dynamodb.send(
              new DeleteCommand({
                TableName: driverOffersTable,
                Key: { driverId, pickupId: id },
              }),
            ),
          ),
        ]),
      );
    } finally {
      pickupIds.clear();
      if (originalPort === undefined) delete process.env.PORT;
      else process.env.PORT = originalPort;
      await app?.close();
      app = undefined;
    }
  });

  return {
    api,
    dispatch() {
      assert.ok(app);
      return {
        stream: app.get(PickupEventStream),
        worker: app.get(PickupMatchingWorker),
      };
    },
    async createPickup(overrides: Partial<typeof tvPickup> = {}) {
      const response = await api()
        .post('/pickup-requests')
        .send({ ...tvPickup, ...overrides });
      const id: unknown = response.body.id;
      if (typeof id === 'string') pickupIds.add(id);
      assert.equal(response.status, 201, response.text);
      assert.ok(typeof id === 'string' && id.length > 0, response.text);
      
      await expect.poll(async () => {
        const saved = await api().get('/pickup-requests/' + id).expect(200);
        return saved.body.matchingStatus;
      }, { timeout: 3000 }).toBe('FINISHED');

      const saved = await api().get('/pickup-requests/' + id).expect(200);
      return { id, accepted: response.body, body: saved.body };
    },
    async restart() {
      await app?.close();
      app = undefined;
      await start();
    },
  };
}
