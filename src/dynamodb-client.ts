import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const dynamodb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint: 'http://127.0.0.1:8000',
    region: 'ap-southeast-2',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  }),
);
