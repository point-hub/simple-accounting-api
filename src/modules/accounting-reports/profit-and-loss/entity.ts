import { BaseEntity } from '@/modules/_shared/entity/base.entity';

import { type IJournal } from './interface';

export const collectionName = 'journals';

export class JournalEntity extends BaseEntity<IJournal> {
  constructor(public data: IJournal) {
    super();

    this.data = this.normalize(data);
    this.data.date = data.date ? new Date(data.date) : undefined;
    this.data.debit = this.parseNumber(data.debit);
    this.data.credit = this.parseNumber(data.credit);
  }

  private parseNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;

    const cleaned = String(value).replace(/,/g, '');
    const parsed = Number(cleaned);

    if (isNaN(parsed)) {
      throw new Error(`Invalid number format: ${value}`);
    }

    return parsed;
  }
}
