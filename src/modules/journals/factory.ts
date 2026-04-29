import { BaseFactory, type IDatabase } from '@point-hub/papi';

import { type IJournal } from './interface';
import { CreateRepository } from './repositories/create.repository';
import { CreateManyRepository } from './repositories/create-many.repository';

export default class JournalFactory extends BaseFactory<IJournal> {
  constructor(public dbConnection: IDatabase, public options?: Record<string, unknown>) {
    super();
  }

  definition() {
    return {
      created_at: new Date(),
      created_by_id: undefined, // injected
    } as IJournal;
  }

  async create() {
    const createRepository = new CreateRepository(this.dbConnection, this.options);
    return await createRepository.handle(this.makeOne());
  }

  async createMany(count: number) {
    const createManyRepository = new CreateManyRepository(this.dbConnection, this.options);
    return await createManyRepository.handle(this.makeMany(count));
  }
}
