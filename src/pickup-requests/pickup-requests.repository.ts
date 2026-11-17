import { Injectable } from '@nestjs/common';
import type { CreatePickupRequestDto } from './create-pickup-request.dto.js';
import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { driverOffersTable } from '../driver-availability/inbox/driver-inbox.repository.js';
import { dynamodb } from '../dynamodb-client.js';

export type PickupRequest = CreatePickupRequestDto & {
  id: string;
  status: 'OPEN' | 'CLAIMED';
  assignedDriverId?: string;
  matchingStatus?: 'PENDING' | 'FINISHED';
  matchingComplete: boolean;
};

@Injectable()
export class PickupRequestsRepository {
  async save(pickup: PickupRequest, offeredDriverIds: string[]): Promise<void> {
    await dynamodb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: 'PickupRequests',
              Item: pickup,
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          ...offeredDriverIds.map((driverId) => ({
            Put: {
              TableName: driverOffersTable,
              Item: { driverId, pickupId: pickup.id },
            },
          })),
        ],
      }),
    );
  }

  async finishMatching(
    id: string,
    matchingComplete: boolean,
    offeredDriverIds: string[],
  ): Promise<void> {
    await dynamodb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: 'PickupRequests',
              Key: { id },
              ConditionExpression: 'matchingStatus = :pending',
              UpdateExpression:
                'SET matchingStatus = :finished, matchingComplete = :complete',
              ExpressionAttributeValues: {
                ':pending': 'PENDING',
                ':finished': 'FINISHED',
                ':complete': matchingComplete,
              },
            },
          },
          ...offeredDriverIds.map((driverId) => ({
            Put: {
              TableName: driverOffersTable,
              Item: { driverId, pickupId: id },
            },
          })),
        ],
      }),
    );
  }

  async findById(id: string): Promise<PickupRequest | undefined> {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: 'PickupRequests',
        Key: { id },
        ConsistentRead: true,
      }),
    );

    return result.Item as PickupRequest | undefined;
  }

  async claimIfOpen(id: string, driverId: string): Promise<void> {
    await dynamodb.send(
      new UpdateCommand({
        TableName: 'PickupRequests',
        Key: { id },
        ConditionExpression: '#status = :open',
        UpdateExpression: 'SET #status = :claimed, assignedDriverId = :driverId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':open': 'OPEN',
          ':claimed': 'CLAIMED',
          ':driverId': driverId,
        },
      }),
    );
  }
}
