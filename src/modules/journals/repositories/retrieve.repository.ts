import type { IDatabase, IPipeline } from '@point-hub/papi';

import type { IAuthUser } from '@/modules/master/users/interface';

import { collectionName } from '../entity';
import type { IJournal } from '../interface';

export interface IRetrieveRepository {
  handle(_id: string): Promise<IRetrieveOutput | null>
  raw(_id: string): Promise<IJournal | null>
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

export class RetrieveRepository implements IRetrieveRepository {
  constructor(
    public database: IDatabase,
    public options?: Record<string, unknown>,
  ) { }

  async handle(_id: string): Promise<IRetrieveOutput | null> {
    const pipeline: IPipeline[] = [];

    pipeline.push(...this.pipeFilter(_id));
    pipeline.push(...this.pipeJoinCreatedById());
    pipeline.push(...this.pipeProject());

    const response = await this.database.collection(collectionName).aggregate<IRetrieveOutput>(pipeline, {}, this.options);
    if (!response || response.data.length === 0) {
      return null;
    }

    return {
      _id: response.data[0]._id,
      date: response.data[0].date,
      form_number: response.data[0].form_number,
      coa_number: response.data[0].coa_number,
      coa_name: response.data[0].coa_name,
      subledger: response.data[0].subledger,
      description: response.data[0].description,
      debit: response.data[0].debit,
      credit: response.data[0].credit,
      created_at: response.data[0].created_at,
      created_by: response.data[0].created_by,
    };
  }

  async raw(_id: string): Promise<IJournal | null> {
    const response = await this.database.collection(collectionName).retrieve<IJournal>(_id, this.options);
    if (!response) {
      return null;
    }

    return response;
  }

  private pipeFilter(_id: string): IPipeline[] {
    return [{ $match: { _id } }];
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
