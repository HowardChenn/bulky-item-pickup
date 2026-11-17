import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const baseUrl = 'http://localhost:' + (process.env.PORT ?? '3000');

const tvPickup = {
  pickupSuburb: 'West End',
  dropoffSuburb: 'New Farm',
  windowStart: '2026-11-14T10:00:00+10:00',
  windowEnd: '2026-11-14T12:00:00+10:00',
  widthCm: 156,
  heightCm: 90,
  depthCm: 10,
  photoKey: 'demo/tv.jpg',
};

async function request(path: string, body?: object) {
  const response = await fetch(baseUrl + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const data: unknown = await response.json();
  return { status: response.status, data };
}

export function postTv(widthCm = tvPickup.widthCm) {
  return request('/pickup-requests', { ...tvPickup, widthCm });
}

export function getPickup(pickupId: string) {
  return request('/pickup-requests/' + encodeURIComponent(pickupId));
}

export function getInbox(driverId: string) {
  return request('/drivers/' + encodeURIComponent(driverId) + '/inbox');
}

export function claimPickup(pickupId: string, driverId: string) {
  return request('/pickup-requests/' + encodeURIComponent(pickupId) + '/claim', {
    driverId,
  });
}

function printResult(label: string, result: Awaited<ReturnType<typeof request>>) {
  console.log(label + ' — HTTP ' + result.status);
  console.log(JSON.stringify(result.data, null, 2));
}

async function createDemoPickup(widthCm?: number) {
  const created = await postTv(widthCm);
  printResult('Created TV pickup', created);
  assert.equal(created.status, 201);
  const { data } = created;
  assert.ok(data && typeof data === 'object' && 'id' in data);
  assert.ok(typeof data.id === 'string' && data.id.length > 0);
  return data.id;
}

async function checkOffers(pickupId: string, driverIds: string[]) {
  return Promise.all(driverIds.map(async (driverId) => {
    const inbox = await getInbox(driverId);
    assert.equal(inbox.status, 200);
    assert.ok(Array.isArray(inbox.data));
    return { driverId, offered: inbox.data.includes(pickupId) };
  }));
}

async function waitForMatching(pickupId: string) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const result = await getPickup(pickupId);
    assert.equal(result.status, 200);

    const pickup = result.data as { matchingStatus?: string };
    if (pickup.matchingStatus === 'FINISHED') return result;

    await setTimeout(100);
  }

  throw new Error(`Matching did not finish within 5 seconds: ${pickupId}`);
}

async function showOffers(widthCm: number) {
  const pickupId = await createDemoPickup(widthCm);
  const pickup = await waitForMatching(pickupId);
  printResult('Saved pickup', pickup);
  assert.equal(pickup.status, 200);
  for (const { driverId, offered } of await checkOffers(pickupId, ['driver-a', 'driver-b', 'driver-c'])) {
    console.log(driverId + ': ' + (offered ? 'offered this pickup' : 'no offer for this pickup'));
  }
}

async function createPickupWithOffers() {
  const pickupId = await createDemoPickup();
  await waitForMatching(pickupId);
  for (const { driverId, offered } of await checkOffers(pickupId, ['driver-a', 'driver-b', 'driver-c'])) {
    assert.equal(offered, driverId !== 'driver-b', 'Unexpected inbox for ' + driverId);
    console.log(driverId + ': ' + (offered ? 'offer confirmed' : 'no offer'));
  }
  return pickupId;
}

async function verifyAssignment(pickupId: string, winner: string) {
  const pickup = await getPickup(pickupId);
  printResult('Saved assignment', pickup);
  assert.equal(pickup.status, 200);
  assert.ok(pickup.data && typeof pickup.data === 'object');
  assert.ok('status' in pickup.data && pickup.data.status === 'CLAIMED');
  assert.ok('assignedDriverId' in pickup.data && pickup.data.assignedDriverId === winner);
}

async function showClaimFlow() {
  const pickupId = await createPickupWithOffers();
  const firstClaim = await claimPickup(pickupId, 'driver-a');
  printResult('Driver A accepts', firstClaim);
  assert.equal(firstClaim.status, 200);

  const [driverC] = await checkOffers(pickupId, ['driver-c']);
  assert.ok(driverC.offered, 'Driver C should still see the offer');
  console.log('driver-c: offer still visible');

  const secondClaim = await claimPickup(pickupId, 'driver-c');
  printResult('Driver C tries to accept', secondClaim);
  assert.equal(secondClaim.status, 409);
  await verifyAssignment(pickupId, 'driver-a');
}

async function raceClaims() {
  const pickupId = await createPickupWithOffers();
  const claims = await Promise.all(['driver-a', 'driver-c'].map(async (driverId) => ({
    driverId,
    result: await claimPickup(pickupId, driverId),
  })));
  for (const { driverId, result } of claims) {
    printResult(driverId + ' claim', result);
  }
  assert.deepEqual(claims.map(({ result }) => result.status).sort(), [200, 409]);

  const winner = claims.find(({ result }) => result.status === 200)?.driverId;
  assert.ok(winner);
  await verifyAssignment(pickupId, winner);
  console.log('Race passed. Winner: ' + winner);
}

const usage = [
  'npm run demo -- post-tv [widthCm]',
  'npm run demo -- get <pickupId>',
  'npm run demo -- inbox <driverId>',
  'npm run demo -- claim <pickupId> <driverId>',
  'npm run demo -- offers [widthCm]',
  'npm run demo -- claim-flow',
  'npm run demo -- race',
].join('\n');

function pickupWidth(input?: string): number {
  const width = input === undefined ? tvPickup.widthCm : Number(input);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('Width must be a positive number in centimetres.');
  }
  return width;
}

async function main(args: string[]) {
  const [command, first, second] = args;
  if (!command || command === '--help') {
    console.log(usage);
    return;
  }

  let result;
  if (command === 'post-tv' && args.length <= 2) {
    result = await postTv(pickupWidth(first));
  } else if (command === 'get' && first && args.length === 2) {
    result = await getPickup(first);
  } else if (command === 'inbox' && first && args.length === 2) {
    result = await getInbox(first);
  } else if (command === 'claim' && first && second && args.length === 3) {
    result = await claimPickup(first, second);
  } else if (command === 'offers' && args.length <= 2) {
    await showOffers(pickupWidth(first));
    return;
  } else if (command === 'claim-flow' && args.length === 1) {
    await showClaimFlow();
    return;
  } else if (command === 'race' && args.length === 1) {
    await raceClaims();
    return;
  } else {
    throw new Error('Invalid command.\n' + usage);
  }

  printResult(command, result);
  if (result.status >= 400) process.exitCode = 1;
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof TypeError && error.message === 'fetch failed') {
      console.error('Check that Nest is running at ' + baseUrl);
    }
    process.exitCode = 1;
  }
}
