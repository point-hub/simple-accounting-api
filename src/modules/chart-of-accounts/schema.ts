/**
 * MongoDB Schema
 *
 * https://www.mongodb.com/docs/current/core/schema-validation/update-schema-validation/
 * https://www.mongodb.com/docs/drivers/node/current/fundamentals/indexes/
 * https://www.mongodb.com/developer/products/mongodb/mongodb-schema-design-best-practices/
 */

import type { ISchema } from '@point-hub/papi';

import { collectionName } from './entity';

export const schema: ISchema[] = [
  {
    collection: collectionName,
    unique: [],
    uniqueIfExists: [],
    indexes: [],
    schema: {
      bsonType: 'object',
      required: ['type', 'category', 'number', 'name'],
      // additionalProperties: false,
      properties: {
        _id: {
          bsonType: 'objectId',
          description: 'Unique ID for the document.',
        },
        type: {
          bsonType: 'string',
          description: 'The type of the chart of account entity.',
        },
        category: {
          bsonType: 'string',
          description: 'The category of the chart of account entity.',
        },
        number: {
          bsonType: 'string',
          description: 'The number of the chart of account entity.',
        },
        name: {
          bsonType: 'string',
          description: 'The name of the chart of account entity.',
        },
        created_at: {
          bsonType: 'date',
          description: 'Timestamp indicating when this record was created.',
        },
        created_by_id: {
          bsonType: 'objectId',
          description: 'The ID of the user who created this record.',
        },
      },
    },
  },
];
