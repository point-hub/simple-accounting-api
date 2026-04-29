import type { IDatabase, IPagination, IPipeline, IQuery } from '@point-hub/papi';
import { BaseMongoDBQueryFilters } from '@point-hub/papi';

import type { IAuthUser } from '@/modules/master/users/interface';

import { collectionName } from '../entity';
import type { IJournal } from '../interface';

export interface IRetrieveManyRepository {
  handle(query: IQuery): Promise<IRetrieveManyOutput>
  raw(query: IQuery): Promise<IRetrieveManyRawOutput>
}

export interface IRetrieveOutput {
  _id: string
  date: string
  form_number: string
  coa_number: string
  coa_name: string
  subledger: string
  description: string
  debit: number
  credit: number
  created_at: Date
  created_by: IAuthUser
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
    const pipeline: IPipeline[] = [];

    pipeline.push(...this.pipeQueryFilter(query));
    pipeline.push(...this.pipeJoinCoa());
    pipeline.push(...this.pipeJoinCreatedById());
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

  async raw(query: IQuery): Promise<IRetrieveManyRawOutput> {
    return await this.database.collection(collectionName).retrieveMany<IJournal>(query, this.options);
  }

  private pipeQueryFilter(query: IQuery): IPipeline[] {
    const filters: Record<string, unknown>[] = [];

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

  private pipeJoinCoa(): IPipeline[] {
    return [
      {
        $lookup: {
          from: 'chart_of_accounts',
          localField: 'coa_number',
          foreignField: 'number',
          as: 'coa',
        },
      },
      {
        $unwind: {
          path: '$coa',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
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
