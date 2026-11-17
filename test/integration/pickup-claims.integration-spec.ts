import { randomUUID } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { tvPickup, usePickupApi } from './pickup-api.js';

describe('pickup workflow', () => {
  const { api, createPickup, dispatch, restart } = usePickupApi();

  function claim(id: string, driverId: string) {
    return api()
      .post('/pickup-requests/' + id + '/claim')
      .send({ driverId });
  }

  async function expectOffer(id: string, driverId: string, offered: boolean) {
    const inbox = await api()
      .get('/drivers/' + driverId + '/inbox')
      .expect(200);
    expect(inbox.body.includes(id)).toBe(offered);
  }

  test('A accepts first and C still sees the offer but cannot claim it', async () => {
    const { id, body } = await createPickup();
    expect(body).toMatchObject({ status: 'OPEN', matchingComplete: true });

    await expectOffer(id, 'driver-a', true);
    await expectOffer(id, 'driver-c', true);
    await expectOffer(id, 'driver-b', false);

    const accepted = await claim(id, 'driver-a').expect(200);
    expect(accepted.body).toMatchObject({
      id,
      status: 'CLAIMED',
      assignedDriverId: 'driver-a',
    });
    await expectOffer(id, 'driver-c', true);

    const conflict = await claim(id, 'driver-c').expect(409);
    expect(conflict.body.message).toBe('This pickup has already been claimed');

    const saved = await api()
      .get('/pickup-requests/' + id)
      .expect(200);
    expect(saved.body).toMatchObject({
      id,
      status: 'CLAIMED',
      assignedDriverId: 'driver-a',
    });
  });

  test('concurrent claims have one winner who matches the saved assignment', async () => {
    const { id } = await createPickup();
    await expectOffer(id, 'driver-a', true);
    await expectOffer(id, 'driver-c', true);

    const claims = await Promise.all(
      ['driver-a', 'driver-c'].map(async (driverId) => ({
        driverId,
        response: await claim(id, driverId),
      })),
    );

    expect(claims.map(({ response }) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = claims.find(({ response }) => response.status === 200);
    expect(winner?.response.body).toMatchObject({
      id,
      status: 'CLAIMED',
      assignedDriverId: winner?.driverId,
    });

    const saved = await api()
      .get('/pickup-requests/' + id)
      .expect(200);
    expect(saved.body).toMatchObject({
      id,
      status: 'CLAIMED',
      assignedDriverId: winner?.driverId,
    });
  });

  test.each([
    ['a zero-width pickup', { widthCm: 0 }],
    [
      'a window that ends before it begins',
      { windowEnd: '2026-11-14T09:00:00+10:00' },
    ],
  ])('rejects %s', async (_label, changes) => {
    await api()
      .post('/pickup-requests')
      .send({ ...tvPickup, ...changes })
      .expect(400);
  });

  test('a driver without an offer cannot claim an open pickup', async () => {
    const { id } = await createPickup();
    await claim(id, 'driver-b').expect(403);
    const saved = await api()
      .get('/pickup-requests/' + id)
      .expect(200);
    expect(saved.body.status).toBe('OPEN');
  });

  test('an unknown pickup returns 404 on read and claim', async () => {
    const id = randomUUID();
    await api()
      .get('/pickup-requests/' + id)
      .expect(404);
    await claim(id, 'driver-a').expect(404);
  });

  test('a saved pickup and its offers survive a Nest restart', async () => {
    const { id } = await createPickup();
    await restart();

    const saved = await api()
      .get('/pickup-requests/' + id)
      .expect(200);
    expect(saved.body).toMatchObject({ ...tvPickup, id, status: 'OPEN' });
    await expectOffer(id, 'driver-a', true);
    await expectOffer(id, 'driver-c', true);
    await expectOffer(id, 'driver-b', false);
    await claim(id, 'driver-c').expect(200);
  });

  test('replaying a pickup event leaves one offer per eligible driver', async () => {
    const { stream, worker } = dispatch();
    const publish = vi.spyOn(stream, 'publish');
    const handle = vi.spyOn(worker, 'handle');

    try {
      const { id } = await createPickup();

      expect(publish).toHaveBeenCalledTimes(1);
      const [event] = publish.mock.calls[0];
      expect(event).toMatchObject({ type: 'PickupRequested', pickupId: id });

      stream.publish(event);

      await expect.poll(() => handle.mock.calls.length).toBe(2);
      expect(handle).toHaveBeenNthCalledWith(2, event);
      await handle.mock.results[1].value;

      for (const driverId of ['driver-a', 'driver-b', 'driver-c']) {
        const inbox = await api().get('/drivers/' + driverId + '/inbox').expect(200);
        const offers = (inbox.body as string[]).filter((pickupId) => pickupId === id);
        expect(offers).toHaveLength(driverId === 'driver-b' ? 0 : 1);
      }
    } finally {
      publish.mockRestore();
      handle.mockRestore();
    }
  });
});
