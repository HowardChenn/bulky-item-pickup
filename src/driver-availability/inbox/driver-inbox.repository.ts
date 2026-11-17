import { Injectable } from '@nestjs/common';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../../dynamodb-client.js';

export const driverOffersTable = 'DriverOffers';

@Injectable()
export class DriverInboxRepository {
  async listPickupIds(driverId: string): Promise<string[]> {
    const pickupIds: string[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const page = await dynamodb.send(
        new QueryCommand({
          TableName: driverOffersTable,
          KeyConditionExpression: 'driverId = :driverId',
          ExpressionAttributeValues: { ':driverId': driverId },
          ProjectionExpression: 'pickupId',
          ConsistentRead: true,
          ExclusiveStartKey: lastKey,
        }),
      );
      for (const item of page.Items ?? []) {
        pickupIds.push(item.pickupId as string);
      }
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    return pickupIds;
  }

  async hasOffer(driverId: string, pickupId: string): Promise<boolean> {
    const { Item } = await dynamodb.send(
      new GetCommand({
        TableName: driverOffersTable,
        Key: { driverId, pickupId },
        ConsistentRead: true,
      }),
    );
    return Item !== undefined;
  }
}
