import type { IDatabase, IPagination, IPipeline, IQuery } from '@point-hub/papi';

import { collectionName } from '../entity';
import type { IJournal } from '../interface';

export interface IRetrieveManyRepository {
  handle(query: IQuery): Promise<IRetrieveManyOutput>
}

export interface IRetrieveOutput {
  _id: string
  coa_number: string
  coa_name: string
  opening_balance: number
  debit: number
  credit: number
  ending_balance: number
}

export interface IRetrieveManyOutput {
  data: IRetrieveOutput[]
  pagination: IPagination
}

export interface IRetrieveManyRawOutput {
  data: IJournal[]
  pagination: IPagination
}

export class RetrieveManyRepository implements IRetrieveManyRepository {
  constructor(
    public database: IDatabase,
    public options?: Record<string, unknown>,
  ) { }

  async handle(query: IQuery): Promise<IRetrieveManyOutput> {
    const dateFrom = new Date(query['search.date_from']);
    const dateTo = new Date(query['search.date_to']);

    const pipeline: IPipeline[] = [
      // 1. Start from COA (IMPORTANT)
      {
        $lookup: {
          from: collectionName, // journals
          localField: 'number',
          foreignField: 'coa_number',
          as: 'journals',
        },
      },

      // 2. Unwind
      {
        $unwind: {
          path: '$journals',
          preserveNullAndEmptyArrays: true,
        },
      },

      // 3. Group per account
      {
        $group: {
          _id: {
            coa_number: '$number',
            coa_name: '$name',
            type: '$type',
          },

          // Opening balance
          opening_balance: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$journals', null] },
                    { $lt: ['$journals.date', dateFrom] },
                  ],
                },
                {
                  $cond: [
                    { $in: [{ $toLower: '$type' }, ['asset', 'expense']] },
                    {
                      $subtract: [
                        { $ifNull: ['$journals.debit', 0] },
                        { $ifNull: ['$journals.credit', 0] },
                      ],
                    },
                    {
                      $subtract: [
                        { $ifNull: ['$journals.credit', 0] },
                        { $ifNull: ['$journals.debit', 0] },
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },

          // Period debit
          debit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$journals', null] },
                    { $gte: ['$journals.date', dateFrom] },
                    { $lte: ['$journals.date', dateTo] },
                  ],
                },
                { $ifNull: ['$journals.debit', 0] },
                0,
              ],
            },
          },

          // Period credit
          credit: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$journals', null] },
                    { $gte: ['$journals.date', dateFrom] },
                    { $lte: ['$journals.date', dateTo] },
                  ],
                },
                { $ifNull: ['$journals.credit', 0] },
                0,
              ],
            },
          },
        },
      },

      // 4. Ending balance
      {
        $addFields: {
          ending_balance: {
            $cond: [
              {
                $in: [{ $toLower: '$_id.type' }, ['asset', 'expense']],
              },
              {
                $add: [
                  '$opening_balance',
                  { $subtract: ['$debit', '$credit'] },
                ],
              },
              {
                $add: [
                  '$opening_balance',
                  { $subtract: ['$credit', '$debit'] },
                ],
              },
            ],
          },
        },
      },

      // 5. Project
      {
        $project: {
          _id: 0,
          coa_number: '$_id.coa_number',
          coa_name: '$_id.coa_name',
          opening_balance: 1,
          debit: 1,
          credit: 1,
          ending_balance: 1,
        },
      },

      // 6. Sort
      {
        $sort: { coa_number: 1 },
      },
    ];

    const response = await this.database.collection('chart_of_accounts').aggregate<IRetrieveOutput>(pipeline, query, this.options);
    return {
      data: response.data.map(item => {
        return {
          _id: item._id,
          coa_number: item.coa_number,
          coa_name: item.coa_name,
          opening_balance: item.opening_balance,
          debit: item.debit,
          credit: item.credit,
          ending_balance: item.ending_balance,
        };
      }),
      pagination: response.pagination,
    };
  }
}
