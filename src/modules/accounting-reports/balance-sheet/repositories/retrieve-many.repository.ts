import type { IDatabase, IPipeline, IQuery } from '@point-hub/papi';

export interface IRetrieveManyRepository {
  handle(query: IQuery): Promise<IRetrieveManyOutput>
}

export interface IData {
  coa_number: string
  coa_name: string
  balance: number
}

export interface IRetrieveManyOutput {
  asset: IData[],
  liability: IData[],
  equity: IData[],
  total_asset: number,
  total_liability: number,
  total_equity: number,
}

export class RetrieveManyRepository implements IRetrieveManyRepository {
  constructor(
    public database: IDatabase,
    public options?: Record<string, unknown>,
  ) { }

  async handle(query: IQuery): Promise<IRetrieveManyOutput> {
    const dateTo = new Date(query['search.date']);
    dateTo.setDate(dateTo.getDate() + 1);

    const pipeline: IPipeline[] = [
      {
        $lookup: {
          from: 'journals',
          let: { coa_number: '$number' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$coa_number', '$$coa_number'] },
                    { $lte: ['$date', dateTo] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                total_debit: { $sum: { $ifNull: ['$debit', 0] } },
                total_credit: { $sum: { $ifNull: ['$credit', 0] } },
              },
            },
          ],
          as: 'journal_summary',
        },
      },

      // 3. Flatten result
      {
        $addFields: {
          journal: {
            $ifNull: [{ $arrayElemAt: ['$journal_summary', 0] }, {
              total_debit: 0,
              total_credit: 0,
            }],
          },
        },
      },

      // 4. Calculate balance
      {
        $addFields: {
          balance: {
            $cond: [
              {
                $in: [
                  { $toLower: '$type' },
                  ['asset', 'expense'],
                ],
              },
              {
                $subtract: [
                  '$journal.total_debit',
                  '$journal.total_credit',
                ],
              },
              {
                $subtract: [
                  '$journal.total_credit',
                  '$journal.total_debit',
                ],
              },
            ],
          },
        },
      },

      // 5. Final shape
      {
        $project: {
          _id: 0,
          coa_number: '$number',
          coa_name: '$name',
          type: 1,
          balance: 1,
        },
      },
    ];

    query.sort = 'coa_number';

    const response = await this.database.collection('chart_of_accounts').aggregate<IData>(pipeline, query, this.options);

    return this.buildBalanceSheet(response.data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildBalanceSheet(data: any) {
    const result = {
      asset: [] as IData[],
      liability: [] as IData[],
      equity: [] as IData[],
      total_asset: 0,
      total_liability: 0,
      total_equity: 0,
    };

    let totalIncome = 0;
    let totalExpense = 0;

    for (const item of data) {
      const type = item.type?.toLowerCase();
      const balance = item.balance ?? 0;

      const row = {
        coa_number: item.coa_number,
        coa_name: item.coa_name,
        balance,
      };

      if (type === 'asset') {
        result.asset.push(row);
        result.total_asset += balance;
      }

      else if (type === 'liability') {
        result.liability.push(row);
        result.total_liability += balance;
      }

      else if (type === 'equity') {
        result.equity.push(row);
        result.total_equity += balance;
      }

      else if (type === 'income') {
        totalIncome += balance;
      }

      else if (type === 'expense') {
        totalExpense += balance;
      }
    }

    const netIncome = totalIncome - totalExpense;

    if (netIncome !== 0) {
      const retained = result.equity.find(
        item => item.coa_name === 'Retained Earnings',
      );

      if (retained) {
        retained.balance += netIncome;
      } else if (netIncome !== 0) {
        result.equity.push({
          coa_number: '39999',
          coa_name: 'Retained Earnings',
          balance: netIncome,
        });
      }
      result.total_equity += netIncome;
    }

    return result;
  }
}
