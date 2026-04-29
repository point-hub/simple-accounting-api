import type { IDatabase, IPipeline } from '@point-hub/papi';

import type { IAuthUser } from '@/modules/master/users/interface';

import { collectionName } from '../entity';
import type { IChartOfAccount } from '../interface';

export interface IRetrieveRepository {
  handle(_id: string): Promise<IRetrieveOutput | null>
  raw(_id: string): Promise<IChartOfAccount | null>
}

export interface IRetrieveOutput {
  _id: string
  number: string
  name: string
  type: string
  category: string
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
      number: response.data[0].number,
      name: response.data[0].name,
      type: response.data[0].type,
      category: response.data[0].category,
      created_at: response.data[0].created_at,
      created_by: response.data[0].created_by,
    };
  }

  async raw(_id: string): Promise<IChartOfAccount | null> {
    const response = await this.database.collection(collectionName).retrieve<IChartOfAccount>(_id, this.options);
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
          number: 1,
          name: 1,
          type: 1,
          category: 1,
          created_at: 1,
          created_by: 1,
        },
      },
    ];
  }
}
