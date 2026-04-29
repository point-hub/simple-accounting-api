import type { IDatabase, IPipeline, IQuery } from '@point-hub/papi';

import type { IChartOfAccount } from '@/modules/chart-of-accounts/interface';

export interface IBalance {
  coa_number: string
  coa_name: string
  balance: number
}

export interface IRetrieveManyOutput {
  operating_incomes: IBalance[]
  non_operating_incomes: IBalance[]
  cost_of_sales: IBalance[]
  operating_expenses: IBalance[]
  non_operating_expenses: IBalance[]
  factory_overhead_costs: IBalance[]

  total_operating_income: number
  total_non_operating_income: number
  total_cost_of_sales: number
  total_operating_expense: number
  total_non_operating_expense: number
  total_factory_overhead_cost: number

  gross_profit: number
  operating_profit: number
  net_profit: number
}

export interface IRetrieveManyRepository {
  handle(query: IQuery): Promise<IRetrieveManyOutput>
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
                    { $gte: ['$date', dateFrom] },
                    { $lte: ['$date', dateTo] },
                  ],
                },
              },
            },
          ],
          as: 'journals',
        },
      },

      { $unwind: { path: '$journals', preserveNullAndEmptyArrays: true } },

      {
        $project: {
          number: 1,
          name: 1,
          category: 1,
          debit: { $ifNull: ['$journals.debit', 0] },
          credit: { $ifNull: ['$journals.credit', 0] },
        },
      },

      {
        $group: {
          _id: {
            coa_number: '$number',
            coa_name: '$name',
            category: '$category',
          },
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
        },
      },
      {
        $addFields: {
          balance: {
            $cond: [
              {
                $in: [
                  { $toLower: '$_id.category' },
                  ['cost of sales', 'operating expense', 'non-operating expense', 'factory overhead cost'],
                ],
              },
              {
                $subtract: ['$debit', '$credit'],
              },
              {
                $subtract: ['$credit', '$debit'],
              },
            ],
          },
        },
      },

      {
        $project: {
          _id: 0,
          coa_number: '$_id.coa_number',
          coa_name: '$_id.coa_name',
          category: '$_id.category',
          balance: 1,
        },
      },
    ];

    const response = await this.database
      .collection('chart_of_accounts')
      .aggregate<IRetrieveManyOutput>(pipeline, query, this.options);

    return this.buildProfitLoss(response.data as IChartOfAccount[]);
  }

  buildProfitLoss(data: IChartOfAccount[]): IRetrieveManyOutput {
    const result: IRetrieveManyOutput = {
      operating_incomes: [],
      non_operating_incomes: [],
      cost_of_sales: [],
      operating_expenses: [],
      non_operating_expenses: [],
      factory_overhead_costs: [],

      total_operating_income: 0,
      total_non_operating_income: 0,
      total_cost_of_sales: 0,
      total_operating_expense: 0,
      total_non_operating_expense: 0,
      total_factory_overhead_cost: 0,

      gross_profit: 0,
      operating_profit: 0,
      net_profit: 0,
    };

    let oi = 0, noi = 0, cos = 0;
    let oe = 0, noe = 0, fo = 0;

    for (const item of data) {
      const category = (item.category || '').toLowerCase();

      const row: IBalance = {
        coa_number: item.coa_number,
        coa_name: item.coa_name,
        balance: item.balance ?? 0,
      };

      if (category === 'operating income') {
        result.operating_incomes.push(row);
        oi += row.balance;
      }

      else if (category === 'non-operating income') {
        result.non_operating_incomes.push(row);
        noi += row.balance;
      }

      else if (category === 'cost of sales') {
        result.cost_of_sales.push(row);
        cos += row.balance;
      }

      else if (category === 'operating expense') {
        result.operating_expenses.push(row);
        oe += row.balance;
      }

      else if (category === 'non-operating expense') {
        result.non_operating_expenses.push(row);
        noe += row.balance;
      }

      else if (category === 'factory overhead cost') {
        result.factory_overhead_costs.push(row);
        fo += row.balance;
      }
    }

    // totals
    result.total_operating_income = oi;
    result.total_non_operating_income = noi;
    result.total_cost_of_sales = cos;
    result.total_operating_expense = oe;
    result.total_non_operating_expense = noe;
    result.total_factory_overhead_cost = fo;

    // profit formulas
    const totalIncome = oi + noi;

    result.gross_profit = totalIncome - cos;
    result.operating_profit = result.gross_profit - oe - fo;
    result.net_profit = result.operating_profit + noi - noe;

    return result;
  }
}