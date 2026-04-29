import type { IDatabase, IPipeline, IQuery } from '@point-hub/papi';

import { collectionName } from '../entity';

export interface IOpeningBalanceRepository {
  handle(query: IQuery): Promise<number>
}

export interface IOpeningBalanceOutput {
  opening_balance: number
}

export class OpeningBalanceRepository implements IOpeningBalanceRepository {
  constructor(
    public database: IDatabase,
    public options?: Record<string, unknown>,
  ) { }

  async handle(query: IQuery): Promise<number> {
    const pipeline: IPipeline[] = [];

    pipeline.push(...this.pipeQueryFilter(query));
    pipeline.push(...this.pipeOpeningBalance());
    const response = await this.database.collection(collectionName).aggregate<IOpeningBalanceOutput>(pipeline, query, this.options);

    return response.data[0]?.opening_balance ?? 0;
  }

  private pipeOpeningBalance(): IPipeline[] {
    return [
      {
        $group: {
          _id: null,
          opening_balance: {
            $sum: {
              $subtract: ['$debit', '$credit'],
            },
          },
        },
      },
    ];
  }

  private pipeQueryFilter(query: IQuery): IPipeline[] {
    const filters: Record<string, unknown>[] = [];

    if (!query?.['search.date_from'] || !query?.['search.coa_number']) {
      return [];
    }

    // Filter specific field
    if (query?.['search.date_from']) {
      filters.push({
        date: {
          $lt: new Date(query['search.date_from']),
        },
      });
    }
    if (query?.['search.coa_number']) {
      filters.push({
        coa_number: query['search.coa_number'],
      });
    }

    return filters.length > 0 ? [{ $match: { $and: filters } }] : [];
  }
}
