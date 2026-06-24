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
      required: ['date', 'form_number', 'coa_number', 'coa_name'],
      // additionalProperties: false,
      properties: {
        _id: {
          bsonType: 'objectId',
          description: 'Unique ID for the document.',
        },
        date: {
          bsonType: 'string',
          description: 'The date of the journal entity.',
        },
        form_number: {
          bsonType: 'string',
          description: 'The form_number of the journal entity.',
        },
        coa_number: {
          bsonType: 'string',
          description: 'The coa_number of the journal entity.',
        },
        coa_name: {
          bsonType: 'string',
          description: 'The coa_name of the journal entity.',
        },
        debit: {
          bsonType: 'string',
          description: 'The debit of the journal entity.',
        },
        credit: {
          bsonType: 'string',
          description: 'The credit of the journal entity.',
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
