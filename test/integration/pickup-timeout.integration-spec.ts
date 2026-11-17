import { describe, expect, test } from 'vitest';
import { usePickupApi } from './pickup-api.js';

describe('all sources respond', () => {
  const { api, createPickup } = usePickupApi();

  test('an oversized TV gets zero offers and matching is complete', async () => {
    const { id, body } = await createPickup({ widthCm: 250 });
    expect(body).toMatchObject({ status: 'OPEN', matchingComplete: true });

    for (const driverId of ['driver-a', 'driver-b', 'driver-c']) {
      const inbox = await api()
        .get('/drivers/' + driverId + '/inbox')
        .expect(200);
      expect(inbox.body).not.toContain(id);
    }
  });
});

describe('Source A times out', () => {
  const { api, createPickup } = usePickupApi('source-a');

  test('saves the pickup and reports incomplete matching with no offers', async () => {
    const { id, accepted, body } = await createPickup();

    expect(accepted).toMatchObject({
      id,
      status: 'OPEN',
      matchingStatus: 'PENDING',
    });

    expect(body).toMatchObject({
      id,
      status: 'OPEN',
      matchingStatus: 'FINISHED',
      matchingComplete: false,
    });

    const saved = await api()
      .get('/pickup-requests/' + id)
      .expect(200);
    expect(saved.body).toMatchObject({ id, matchingComplete: false });

    for (const driverId of ['driver-a', 'driver-b', 'driver-c']) {
      const inbox = await api()
        .get('/drivers/' + driverId + '/inbox')
        .expect(200);
      expect(inbox.body).not.toContain(id);
    }
  });
});

describe('Source B times out', () => {
  const { api, createPickup } = usePickupApi('source-b');

  test('reports incomplete matching and still offers the pickup to A and C', async () => {
    const { id, body } = await createPickup();
    expect(body).toMatchObject({ status: 'OPEN', matchingComplete: false });

    for (const driverId of ['driver-a', 'driver-b', 'driver-c']) {
      const inbox = await api()
        .get('/drivers/' + driverId + '/inbox')
        .expect(200);
      expect(inbox.body.includes(id)).toBe(driverId !== 'driver-b');
    }
  });
});
