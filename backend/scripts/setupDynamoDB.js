/**
 * DynamoDB Table Creation and Initializer Script
 * Creates tables in AWS DynamoDB or DynamoDB Local according to PRD specs.
 */
const {
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  waitUntilTableExists
} = require('@aws-sdk/client-dynamodb');
const { dynamoClient } = require('../config/aws');
require('dotenv').config();

const TABLES = [
  {
    TableName: process.env.DYNAMODB_TABLE_PARKING_SLOTS || 'ParkingSlots',
    KeySchema: [{ AttributeName: 'slotId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'slotId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: process.env.DYNAMODB_TABLE_BOOKINGS || 'Bookings',
    KeySchema: [{ AttributeName: 'bookingId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'bookingId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'slotId', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-index',
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'slotId-index',
        KeySchema: [{ AttributeName: 'slotId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: process.env.DYNAMODB_TABLE_DETECTION_HISTORY || 'DetectionHistory',
    KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'eventId', AttributeType: 'S' },
      { AttributeName: 'slotId', AttributeType: 'S' },
      { AttributeName: 'timestamp', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'slotId-timestamp-index',
        KeySchema: [
          { AttributeName: 'slotId', KeyType: 'HASH' },
          { AttributeName: 'timestamp', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
];

async function setupTables() {
  console.log('--- Initializing DynamoDB Tables Setup ---');
  if (!['aws', 'dynamodb-local'].includes(process.env.DB_MODE)) {
    throw new Error('Set DB_MODE=aws or DB_MODE=dynamodb-local before provisioning tables. Local JSON mode has no DynamoDB tables.');
  }
  if (!dynamoClient) {
    throw new Error('No DynamoDB client configured. Set DB_MODE=aws or DB_MODE=dynamodb-local before provisioning tables.');
  }

  let lastEvaluatedTableName;
  const existingTables = new Set();
  do {
    const listResult = await dynamoClient.send(new ListTablesCommand({ ExclusiveStartTableName: lastEvaluatedTableName }));
    (listResult.TableNames || []).forEach(name => existingTables.add(name));
    lastEvaluatedTableName = listResult.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);
  console.log('[Setup] Existing tables:', [...existingTables]);

  for (const tableConfig of TABLES) {
    if (existingTables.has(tableConfig.TableName)) {
      console.log(`[Setup] Table already exists: ${tableConfig.TableName}`);
    } else {
      console.log(`[Setup] Creating table: ${tableConfig.TableName}...`);
      await dynamoClient.send(new CreateTableCommand(tableConfig));
      console.log(`[Setup] Create request accepted: ${tableConfig.TableName}`);
    }
    await waitUntilTableExists({ client: dynamoClient, maxWaitTime: 180 }, { TableName: tableConfig.TableName });
    const { Table } = await dynamoClient.send(new DescribeTableCommand({ TableName: tableConfig.TableName }));
    const actualKeys = (Table.KeySchema || []).map(key => `${key.AttributeName}:${key.KeyType}`).sort();
    const expectedKeys = tableConfig.KeySchema.map(key => `${key.AttributeName}:${key.KeyType}`).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`Table ${tableConfig.TableName} has key schema [${actualKeys.join(', ')}]; expected [${expectedKeys.join(', ')}].`);
    }
    const actualIndexes = new Set((Table.GlobalSecondaryIndexes || []).map(index => index.IndexName));
    const missingIndexes = (tableConfig.GlobalSecondaryIndexes || [])
      .map(index => index.IndexName)
      .filter(indexName => !actualIndexes.has(indexName));
    if (missingIndexes.length) {
      throw new Error(`Table ${tableConfig.TableName} is missing required indexes: ${missingIndexes.join(', ')}.`);
    }
    console.log(`[Setup] Table is active: ${tableConfig.TableName}`);
  }

  console.log('[Setup] All DynamoDB tables ready.');
}

if (require.main === module) {
  setupTables().catch(err => {
    console.error('[Setup] Error creating DynamoDB tables:', err);
    process.exitCode = 1;
  });
}

module.exports = { setupTables, TABLES };
