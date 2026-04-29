import type { IDatabase, IPagination, IPipeline, IQuery } from '@point-hub/papi';
import { BaseMongoDBQueryFilters } from '@point-hub/papi';

import { collectionName } from '../entity';
import type { IRetrieveOutput } from './retrieve.repository';

export interface ISubledgersRepository {
  handle(query: IQuery): Promise<ISubledgersOutput>
}

export interface ISubledgersOutput {
  data: IRetrieveOutput[]
  pagination: IPagination
}

export class SubledgersRepository implements ISubledgersRepository {
  constructor(
    public database: IDatabase,
    public options?: Record<string, unknown>,
  ) { }

  async handle(query: IQuery): Promise<ISubledgersOutput> {
    const pipeline: IPipeline[] = [];

    pipeline.push(...this.pipeQueryFilter(query));
    pipeline.push(...this.pipeJoinCreatedById());
    pipeline.push(...this.pipeDeduplicate());
    pipeline.push(...this.pipeProject());

    const response = await this.database.collection(collectionName).aggregate<IRetrieveOutput>(pipeline, query, this.options);

    return {
      data: response.data.map(item => {
        return {
          _id: item._id,
          date: item.date,
          form_number: item.form_number,
          coa_number: item.coa_number,
          coa_name: item.coa_name,
          subledger: item.subledger,
          description: item.description,
          debit: item.debit,
          credit: item.credit,
          created_at: item.created_at,
          created_by: item.created_by,
        };
      }),
      pagination: response.pagination,
    };
  }

  private pipeDeduplicate(): IPipeline[] {
    return [
      {
        $group: {
          _id: '$subledger',
          doc: { $first: '$$ROOT' },
        },
      },
      {
        $replaceRoot: { newRoot: '$doc' },
      },
    ];
  }

  private pipeQueryFilter(query: IQuery): IPipeline[] {
    const filters: Record<string, unknown>[] = [];

    // Always exclude empty subledger
    filters.push({
      $expr: {
        $gt: [
          { $strLenCP: { $trim: { input: { $ifNull: ['$subledger', ''] } } } },
          0,
        ],
      },
    });

    // General search across multiple fields
    if (query?.['search.all']) {
      const searchRegex = { $regex: query?.['search.all'], $options: 'i' };
      const fields = ['form_number', 'coa_number', 'coa_name', 'subledger', 'description'];
      filters.push({
        $or: fields.map((field) => ({ [field]: searchRegex })),
      });
    }

    // Filter specific field
    BaseMongoDBQueryFilters.addDateRangeFilter(filters, 'date', query?.['search.date_from'], query?.['search.date_to']);
    BaseMongoDBQueryFilters.addRegexFilter(filters, 'form_number', query?.['search.form_number']);
    BaseMongoDBQueryFilters.addRegexFilter(filters, 'coa_number', query?.['search.coa_number']);
    BaseMongoDBQueryFilters.addRegexFilter(filters, 'coa_name', query?.['search.coa_name']);
    BaseMongoDBQueryFilters.addRegexFilter(filters, 'subledger', query?.['search.subledger']);
    BaseMongoDBQueryFilters.addRegexFilter(filters, 'description', query?.['search.description']);
    BaseMongoDBQueryFilters.addNumberFilter(filters, 'debit', query?.['search.debit']);
    BaseMongoDBQueryFilters.addNumberFilter(filters, 'credit', query?.['search.credit']);

    return filters.length > 0 ? [{ $match: { $and: filters } }] : [];
  }

  private pipeJoinCreatedById(): IPipeline[] {
    return [
      {
        $lookup: {
          from: 'users',
          let: { userId: '$created_by_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
            {
              $project: {
                _id: 1,
                name: 1,
                username: 1,
                email: 1,
              },
            },
          ],
          as: 'created_by',
        },
      },
      {
        $unwind: {
          path: '$created_by',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  private pipeProject(): IPipeline[] {
    return [
      {
        $project: {
          _id: 1,
          date: 1,
          form_number: 1,
          coa_number: 1,
          coa_name: 1,
          subledger: 1,
          description: 1,
          debit: 1,
          credit: 1,
          created_at: 1,
          created_by: 1,
        },
      },
    ];
  }
}
