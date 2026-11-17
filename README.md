# Bulky-Item Pickup

A NestJS API that records pickup requests, offers them to eligible drivers, and uses DynamoDB Local to let one driver claim each pickup. See the [project brief](../reference/BULKY_ITEM_PICKUP_PROJECT.md) and [progress tracker](../reference/BULKY_ITEM_PICKUP_PROGRESS.md).

- **New database:** [First-time setup](#1-first-time-setup)
- **Existing database:** [Start the app again](#2-start-the-app-again)
- **Run the demo:** [Post the TV and claim it step by step](#43-driver-a-accepts-and-driver-c-sees-that-its-claimed)
- **Stage 5:** [Start Elasticsearch and seed driver locations](#9-elasticsearch-local)
- **Stage 6:** [Upload a photo to local S3](#10-local-s3-photos)
- **Reference:** [Test data](#3-prepare-pickups-and-drivers) · [DynamoDB and AWS costs](#5-dynamodb-local-and-aws) · [Code and tests](#8-code-and-tests)

Run every command from `flight_centre_prep` in both terminals. The npm and Docker Compose commands already point to the app subfolder.

## 1. First-time setup

**1. Install anything you’re missing.** On macOS with Homebrew:

```bash
brew install node@24
brew install awscli
```

**2. Start Docker Desktop.** Wait for it to finish starting, then run this in **Terminal 1**:

```bash
export PATH="$(brew --prefix node@24)/bin:$PATH" &&
  npm --prefix bulky-item-pickup ci &&
  docker compose -f bulky-item-pickup/compose.yaml up -d
```

**3. Create both tables.** Run both commands once for a new Docker volume. Each should print `ACTIVE`.

```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local aws dynamodb create-table --endpoint-url http://127.0.0.1:8000 --region ap-southeast-2 --table-name PickupRequests --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST --query 'TableDescription.TableStatus' --output text --no-cli-pager
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local aws dynamodb create-table --endpoint-url http://127.0.0.1:8000 --region ap-southeast-2 --table-name DriverOffers --attribute-definitions AttributeName=driverId,AttributeType=S AttributeName=pickupId,AttributeType=S --key-schema AttributeName=driverId,KeyType=HASH AttributeName=pickupId,KeyType=RANGE --billing-mode PAY_PER_REQUEST --query 'TableDescription.TableStatus' --output text --no-cli-pager
```

**4. Start Nest.** Leave Terminal 1 running.

```bash
npm --prefix bulky-item-pickup run start:dev
```

## 2. Start the app again

**1. Start Docker Desktop.** Then run this in **Terminal 1**:

```bash
export PATH="$(brew --prefix node@24)/bin:$PATH" &&
  docker compose -f bulky-item-pickup/compose.yaml up -d
```

**2. Check that both tables exist.** This command is read-only.

```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local aws dynamodb list-tables --endpoint-url http://127.0.0.1:8000 --region ap-southeast-2 --output json --no-cli-pager
```

Look for `PickupRequests` and `DriverOffers`. If a table is missing, run its create command in [first-time setup](#1-first-time-setup). If the command times out, see [troubleshooting](#61-dynamodb-times-out).

**3. Start Nest.** Leave Terminal 1 running.

```bash
npm --prefix bulky-item-pickup run start:dev
```

If `package-lock.json` changed, run `npm --prefix bulky-item-pickup ci` before starting Nest.

## 3. Prepare pickups and drivers

The [demo script](scripts/pickup-demo.ts) holds the TV data. The [mock availability controller](src/driver-availability/mock-availability.controller.ts) holds the driver examples.

### 3.1 Open the demo terminal

With Nest and DynamoDB running, open **Terminal 2**:

```bash
export PATH="$(brew --prefix node@24)/bin:$PATH"
```

### 3.2 Create or change the pickup

```bash
npm --prefix bulky-item-pickup run demo -- post-tv
```

Expect HTTP 201 and a new pickup ID. By default the TV is **156 × 90 × 10 cm**, with a **West End → New Farm** pickup from **10 am to noon**. Run `npm --prefix bulky-item-pickup run demo -- post-tv 250` for a 250 cm width. To change other details, edit `tvPickup` at the top of the [script](scripts/pickup-demo.ts). If you change the date, update the mock drivers’ shift dates too.

### 3.3 Inspect or add a mock driver

Drivers are seeded in [src/driver-availability/mock-availability.controller.ts](src/driver-availability/mock-availability.controller.ts). Run these commands to see the raw provider responses:

```bash
curl -fsS http://localhost:3000/mock-availability/source-a
printf '\n'
curl -fsS http://localhost:3000/mock-availability/source-b
printf '\n'
```

| Driver | Where they are | Shift in Brisbane time | Cargo width | Result for the TV |
| --- | --- | --- | --- | --- |
| A | West End | 9 am–1 pm | 180 cm | Gets an offer |
| C | South Brisbane | 9 am–1 pm | 180 cm | Gets an offer through the seeded nearby-suburb rule |
| B | New Farm | 10 am–1 pm | 120 cm | Fails proximity and cargo fit |

To make **your own qualifying driver**, open [the Source A fixture](src/driver-availability/mock-availability.controller.ts#L6) and insert this object inside `sourceA()`’s `drivers` array, directly after the `driver-c` object and before the closing `],`:

```ts
{
  driverId: 'driver-demo',
  suburb: 'South Brisbane',
  availableFrom: '2026-11-14T09:00:00+10:00',
  availableUntil: '2026-11-14T13:00:00+10:00',
  cargoCm: { width: 180, height: 120, depth: 200 },
},
```

Save and wait for Nest to reload. Create a new TV pickup and check the driver’s inbox:

```bash
npm --prefix bulky-item-pickup run demo -- post-tv
npm --prefix bulky-item-pickup run demo -- inbox driver-demo
```

The inbox should contain the new pickup ID. To see a driver fail **only cargo fit**, change the demo driver’s width from `180` to `120`, save, wait for the reload, and repeat that command. Expect the new pickup ID to be absent. Earlier offers stay in the inbox. Remove the demo object when you’re finished so the scenarios below use the original drivers. Source B’s fixture uses `id`, `location`, `shift`, and dimensions in metres.

## 4. Run the scenarios

### 4.1 Create and read a pickup and check its offers

```bash
npm --prefix bulky-item-pickup run demo -- offers
```

This creates a fresh TV pickup, reads the saved record, and checks whether **that pickup ID** appears in each driver’s inbox. Expect `OPEN`, `matchingComplete: true`, offers for A and C, and no offer for B.

### 4.2 Compare zero matches with a source timeout

With both sources responding, a 250 cm-wide TV gets zero offers and `matchingComplete: true`:

```bash
npm --prefix bulky-item-pickup run demo -- offers 250
```

To simulate a timeout, open [the Source A mock](src/driver-availability/mock-availability.controller.ts#L6). Replace its `sourceA() {` line with the two lines below and keep its existing `return`:

```ts
  async sourceA() {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
```

Save and wait for Nest to reload, then run:

```bash
npm --prefix bulky-item-pickup run demo -- offers
```

Expect zero offers and `matchingComplete: false`. Source A’s one-second timeout expires before the mock responds. Afterward, remove the delay, restore `sourceA() {`, and wait for Nest to reload.

### 4.3 Driver A accepts and Driver C sees that it’s claimed

Set up [Terminal 2](#31-open-the-demo-terminal), then run these steps in order.

**1. Post the TV pickup as the buyer.**

```bash
npm --prefix bulky-item-pickup run demo -- post-tv
```

Expect `201` and `OPEN`. Copy the response’s `id` into the quotes:

```bash
pickup_id='PASTE_PICKUP_ID_HERE'
```

**2. Open each driver's inbox to see who received the offer.**

```bash
npm --prefix bulky-item-pickup run demo -- inbox driver-a
npm --prefix bulky-item-pickup run demo -- inbox driver-c
npm --prefix bulky-item-pickup run demo -- inbox driver-b
```

A and C see the new pickup ID. B’s inbox has no offer for that ID.

**3. Accept the open pickup as Driver A.**

```bash
npm --prefix bulky-item-pickup run demo -- claim "$pickup_id" driver-a
```

Expect HTTP `200` with `status: "CLAIMED"` and `assignedDriverId: "driver-a"`.

**4. Open Driver C's inbox again.**

```bash
npm --prefix bulky-item-pickup run demo -- inbox driver-c
```

The same pickup ID should still be there.

**5. Try to accept the pickup as Driver C.**

```bash
npm --prefix bulky-item-pickup run demo -- claim "$pickup_id" driver-c
```

Expect HTTP `409` with **“This pickup has already been claimed.”**

**6. Check who has the job.**

```bash
npm --prefix bulky-item-pickup run demo -- get "$pickup_id"
```

Expect HTTP `200`, `status: "CLAIMED"`, and `assignedDriverId: "driver-a"`.

### 4.4 Race two eligible drivers

```bash
npm --prefix bulky-item-pickup run demo -- race
```

The script creates a fresh TV pickup, checks that A and C received its offer, sends both claims concurrently, and reads the stored assignment. It succeeds only if one claim returns `200`, the other returns `409`, and the saved winner matches the successful claim.

### 4.5 Verify persistence after restarting Nest

In **Terminal 2**, run `npm --prefix bulky-item-pickup run demo -- post-tv`, then copy the ID into the first line below.

```bash
pickup_id='PASTE_PICKUP_ID_HERE'
npm --prefix bulky-item-pickup run demo -- get "$pickup_id"
npm --prefix bulky-item-pickup run demo -- inbox driver-a
```

In **Terminal 1**, press **Ctrl+C**, then run `npm --prefix bulky-item-pickup run start:dev` again. Leave DynamoDB running. In the same **Terminal 2**:

```bash
npm --prefix bulky-item-pickup run demo -- get "$pickup_id"
npm --prefix bulky-item-pickup run demo -- inbox driver-a
npm --prefix bulky-item-pickup run demo -- get unknown-id
```

Expect `200 OK` with the original pickup, the same ID in Driver A’s inbox, and `404 Not Found` for the unknown ID.

## 5. DynamoDB Local and AWS

### 5.1 What runs and where the records live

Nest sends DynamoDB API requests to `http://127.0.0.1:8000`. Docker forwards that port to DynamoDB Local, which runs in the container and stores the tables in a SQLite database file. In this project, `-sharedDb` produces `shared-local-instance.db`, and `-dbPath ./data` places it at `/home/dynamodblocal/data/shared-local-instance.db` inside the container. Docker keeps that directory in the `bulky-item-pickup_dynamodb-data` named volume under the default Compose project name. [Compose file](compose.yaml) · [DynamoDB Local usage notes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html)

To see the mounted file, run this while the container is up:

```bash
docker compose -f bulky-item-pickup/compose.yaml exec -T dynamodb ls -l /home/dynamodblocal/data
```

The app writes the pickup and its offers together in one DynamoDB transaction. `PickupRequests` stores the job and its assignment. `DriverOffers` stores which drivers were invited, so offers stay visible after a claim and survive restarts along with the pickup. Offers from the previous in-memory version are unavailable in the new table. Create a fresh pickup for the demo. DynamoDB Local incurs no AWS DynamoDB charges.

### 5.2 What changes in AWS

| | DynamoDB Local | AWS DynamoDB |
| --- | --- | --- |
| Who runs it | Docker on your Mac | AWS manages the service, scaling, and availability |
| What the app connects to | The loopback URL on port 8000 | AWS’s regional HTTPS endpoint |
| Credentials | Local placeholder values | AWS credentials via IAM |
| Data | SQLite file in a Docker volume | A managed table in your AWS account and Region |
| Capacity | Local development and testing | Cloud request, capacity, and storage pricing |

**To try a cloud table with this app:**

1. In the AWS Console, switch to **Asia Pacific (Sydney)** and go to **DynamoDB → Tables → Create table**. Create `PickupRequests` with string partition key `id`, and `DriverOffers` with string partition key `driverId` and string sort key `pickupId`. Choose **On-demand** for both.
2. Give the app identity `dynamodb:PutItem` and `dynamodb:GetItem` on both tables, `dynamodb:UpdateItem` on `PickupRequests`, and `dynamodb:Query` on `DriverOffers`. For Nest running on your Mac, use an authenticated AWS CLI profile. For Nest hosted on AWS, grant those permissions to the runtime’s IAM role.
3. In [dynamodb-client.ts](src/dynamodb-client.ts), use `new DynamoDBClient({ region: 'ap-southeast-2' })` for cloud mode. Omit the local endpoint and placeholder credentials in that mode so the SDK picks the regional URL and loads credentials. Create fresh demo pickups to populate the cloud tables. [AWS SDK credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-credential-providers.html)

That moves pickup storage to AWS. You can still run Nest and its mock driver sources on your Mac.

### 5.3 What it costs

For **DynamoDB Standard on-demand in Sydney**, the AWS price list checked on **15 November 2026** gives these rates in USD:

| Usage | Rate |
| --- | ---: |
| Writes | US$0.71 per million write request units |
| Reads | US$0.1425 per million read request units |
| Storage | US$0.285 per GB-month beyond the first 25 GB-months of Standard storage covered by the free tier |

For a small demo, **10,000 write units and 10,000 read units cost about US$0.0085** in request charges before any credits. A write of up to 1 KB uses one write unit. A strongly consistent read, which this app uses, takes one read unit for up to 4 KB. Storage beyond the allowance, optional backups, and hosting Nest are separate costs. [AWS Sydney price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-southeast-2/index.json) · [AWS DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)

## 6. Troubleshoot

### 6.1 DynamoDB times out

Check the container:

```bash
docker compose -f bulky-item-pickup/compose.yaml ps
docker compose -f bulky-item-pickup/compose.yaml logs --tail=30 dynamodb
```

If the logs show `unable to open database file`, the mounted directory may be owned by root. The DynamoDB process runs as user `1000` in the image used here. Give it ownership of the directory and restart the service:

```bash
docker compose -f bulky-item-pickup/compose.yaml exec -T --user 0 dynamodb chown 1000:1000 /home/dynamodblocal/data
docker compose -f bulky-item-pickup/compose.yaml restart dynamodb
docker compose -f bulky-item-pickup/compose.yaml ps
```

Once the container is **Up**, retry the command that timed out.

### 6.2 An eligible driver gets 403

Create a fresh pickup and check Driver A’s inbox:

```bash
npm --prefix bulky-item-pickup run demo -- post-tv
npm --prefix bulky-item-pickup run demo -- inbox driver-a
```

Confirm that the inbox contains the exact pickup ID you’re claiming. If the POST shows `matchingComplete: false`, check that the temporary Source A delay from [4.2](#42-compare-zero-matches-with-a-source-timeout) is removed. Pickups created before the inbox moved to DynamoDB may have no saved offers.

## 7. Stop the services

Press **Ctrl+C** in Terminal 1. To stop DynamoDB and keep its data volume, run:

```bash
docker compose -f bulky-item-pickup/compose.yaml stop
```

## 8. Code and tests

| Folder | What lives there |
| --- | --- |
| `src/pickup-requests/` | Create, read, and claim pickups |
| `src/driver-availability/adapters/` | Fetch and translate each provider’s driver data |
| `src/driver-availability/matching/` | Location, availability, and cargo rules |
| `src/driver-availability/inbox/` | Read offers and check who received one |
| `test/unit/` | Matching rules, adapter mapping, and the starter controller |
| `test/integration/` | HTTP tests for claims, timeouts, restart persistence, and provider contracts |

**Unit tests** run without Nest or DynamoDB. Run from `flight_centre_prep`:

```bash
npm --prefix bulky-item-pickup test
```

**Integration tests** start their own Nest instances. Start DynamoDB Local with both tables from [setup](#2-start-the-app-again), then run:

```bash
npm --prefix bulky-item-pickup run test:integration
```

To run just the claim tests:

```bash
npm --prefix bulky-item-pickup run test:integration -- pickup-claims.integration-spec.ts
```

## 9. Elasticsearch Local

[Compose](compose.yaml#L11) runs Elasticsearch on port 9200 under the opt-in `search` profile. The [mock availability controller](src/driver-availability/mock-availability.controller.ts) defines the driver IDs and suburbs. The commands below seed fictional coordinates directly into Elasticsearch. With `ELASTICSEARCH_URL` set, NestJS searches by distance. Otherwise, [NestJS matching](src/driver-availability/matching/match-drivers.ts#L21) uses the original suburb rules.

### 9.1 Start Elasticsearch

From `flight_centre_prep`, with Docker Desktop running:

```bash
docker compose -f bulky-item-pickup/compose.yaml --profile search up -d elasticsearch
curl -fsS http://127.0.0.1:9200/
```

Wait for the second command to return Elasticsearch version JSON.

### 9.2 Create and seed a new index

Check whether the index exists:

```bash
curl -sS -o /dev/null -w 'drivers index: HTTP %{http_code}\n' --max-time 5 -I http://127.0.0.1:9200/drivers
```

For HTTP `404`, run these four commands in order. For HTTP `200`, go straight to [Verify the existing index](#93-verify-the-existing-index).

```bash
curl --fail-with-body -sS --max-time 20 -H 'Content-Type: application/json' -X PUT 'http://127.0.0.1:9200/drivers' -d '{"settings":{"number_of_replicas":0},"mappings":{"properties":{"suburb":{"type":"keyword"},"location":{"type":"geo_point"}}}}'
curl --fail-with-body -sS --max-time 20 -H 'Content-Type: application/json' -X PUT 'http://127.0.0.1:9200/drivers/_create/driver-a?refresh=wait_for' -d '{"suburb":"West End","location":{"lat":-27.4825,"lon":153.0105}}'
curl --fail-with-body -sS --max-time 20 -H 'Content-Type: application/json' -X PUT 'http://127.0.0.1:9200/drivers/_create/driver-b?refresh=wait_for' -d '{"suburb":"New Farm","location":{"lat":-27.4671,"lon":153.0485}}'
curl --fail-with-body -sS --max-time 20 -H 'Content-Type: application/json' -X PUT 'http://127.0.0.1:9200/drivers/_create/driver-c?refresh=wait_for' -d '{"suburb":"South Brisbane","location":{"lat":-27.4743,"lon":153.0188}}'
```

The first command defines `location` as a `geo_point` for distance queries. Each `_create` call adds one document using its mock driver ID and returns `409` if that ID already exists. `refresh=wait_for` waits until the document is searchable.

### 9.3 Verify the existing index

```bash
curl -fsS --max-time 5 'http://127.0.0.1:9200/drivers/_mapping?pretty'
curl -fsS --max-time 5 'http://127.0.0.1:9200/drivers/_search?pretty&filter_path=hits.total,hits.hits._id,hits.hits._source'
```

Expect a `geo_point` mapping for `location` and three search hits with the IDs `driver-a`, `driver-b`, and `driver-c`.

### 9.4 Search within 2 km of the TV pickup

Run this from `flight_centre_prep` with Elasticsearch running:

```bash
curl --fail-with-body -sS --max-time 5 \
  'http://127.0.0.1:9200/drivers/_search?pretty&filter_path=hits.hits._id' \
  -H 'Content-Type: application/json' \
  -d '{"query":{"bool":{"filter":{"geo_distance":{"distance":"2km","location":{"lat":-27.4825,"lon":153.0105}}}}}}'
```

Expect `driver-a` and `driver-c`. The coordinates are the fictional West End pickup point. `geo_distance` selects nearby locations, and `filter_path` limits the response to document IDs.

### 9.5 Run Nest with Elasticsearch enabled

With both local databases running, stop any existing Nest process and start it from `flight_centre_prep`:

```bash
ELASTICSEARCH_URL=http://127.0.0.1:9200 npm --prefix bulky-item-pickup run start:dev
```

From a second terminal, post the TV and check the offers:

```bash
npm --prefix bulky-item-pickup run demo -- offers
```

Expect `matchingComplete: true` and offers for A and C. Try `npm --prefix bulky-item-pickup run demo -- offers 250` to verify that the nearby drivers still fail the cargo check for a 250 cm TV.

## 10. Local S3 photos

Run these commands from `flight_centre_prep`. The endpoint and placeholder credentials are for S3Mock on your Mac.

### 10.1 Start S3Mock

```bash
docker compose -f bulky-item-pickup/compose.yaml --profile photos up -d s3
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws s3api list-buckets --endpoint-url http://127.0.0.1:9090 \
  --region ap-southeast-2 --no-cli-pager
```

### 10.2 Create the bucket and upload a JPEG

Create the bucket once if `pickup-photos` is absent from the bucket list:

```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws s3api create-bucket --endpoint-url http://127.0.0.1:9090 \
  --region ap-southeast-2 --bucket pickup-photos \
  --create-bucket-configuration LocationConstraint=ap-southeast-2 --no-cli-pager
```

Put a sample JPEG named `tv.jpg` inside `bulky-item-pickup`, then upload it:

```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws s3api put-object --endpoint-url http://127.0.0.1:9090 \
  --region ap-southeast-2 --bucket pickup-photos --key demo/tv.jpg \
  --body bulky-item-pickup/tv.jpg --content-type image/jpeg --no-cli-pager
```

### 10.3 Verify the uploaded photo

```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws s3api head-object --endpoint-url http://127.0.0.1:9090 \
  --region ap-southeast-2 --bucket pickup-photos --key demo/tv.jpg --no-cli-pager
```

Expect `ContentType: image/jpeg` and a positive `ContentLength`. The object key is `demo/tv.jpg`. S3Mock is currently configured without a named volume, so recreating the container can require creating the bucket and uploading the photo again.

### 10.4 Download the photo using the saved key

```bash
npm --prefix bulky-item-pickup run demo -- offers
```

Under **Saved pickup**, find `photoKey`. Use that value in `--key`:

```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws s3api get-object --endpoint-url http://127.0.0.1:9090 \
  --region ap-southeast-2 --bucket pickup-photos --key demo/tv.jpg \
  --no-cli-pager /tmp/pickup-tv-downloaded.jpg
file /tmp/pickup-tv-downloaded.jpg
```

Expect `JPEG image data`. If the source file is actually a PNG, convert it to JPEG before uploading it with `--content-type image/jpeg`.
