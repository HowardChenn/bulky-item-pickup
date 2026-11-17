import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { AppModule } from '../../src/app.module.js';

let app: INestApplication;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

const dimensions = {
  width: expect.any(Number),
  height: expect.any(Number),
  depth: expect.any(Number),
};
const timestamp = expect.stringMatching(
  /T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/,
);

function expectSourceBContract(body: unknown) {
  expect(body).toEqual(expect.any(Array));
  expect(body).not.toHaveLength(0);
  for (const driver of body as unknown[]) {
    expect(driver).toMatchObject({
      id: expect.any(String),
      location: expect.any(String),
      shift: { start: timestamp, end: timestamp },
      cargoMetres: dimensions,
    });
  }
}

test('GET Source A returns drivers with flat availability and centimetres', async () => {
  const response = await request(app.getHttpServer())
    .get('/mock-availability/source-a')
    .expect('Content-Type', /json/)
    .expect(200);

  expect(response.body).toMatchObject({ drivers: expect.any(Array) });
  expect(response.body.drivers).not.toHaveLength(0);
  for (const driver of response.body.drivers) {
    expect(driver).toMatchObject({
      driverId: expect.any(String),
      suburb: expect.any(String),
      availableFrom: timestamp,
      availableUntil: timestamp,
      cargoCm: dimensions,
    });
  }
});

test('GET Source B returns an array with nested shifts and metres', async () => {
  const response = await request(app.getHttpServer())
    .get('/mock-availability/source-b')
    .expect('Content-Type', /json/)
    .expect(200);

  expectSourceBContract(response.body);
});

test('the Source B contract check fails when shift is renamed', async () => {
  const { body } = await request(app.getHttpServer())
    .get('/mock-availability/source-b')
    .expect(200);
  expectSourceBContract(body);

  const changed = body.map(({ shift, ...driver }: Record<string, unknown>) => ({
    ...driver,
    availability: shift,
  }));
  expect(() => expectSourceBContract(changed)).toThrow();
});
