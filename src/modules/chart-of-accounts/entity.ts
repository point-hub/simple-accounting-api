import { BaseEntity } from '@/modules/_shared/entity/base.entity';

import { type IChartOfAccount } from './interface';

export const collectionName = 'chart_of_accounts';

export class ChartOfAccountEntity extends BaseEntity<IChartOfAccount> {
  constructor(public data: IChartOfAccount) {
    super();

    this.data = this.normalize(this.data);
  }
}
