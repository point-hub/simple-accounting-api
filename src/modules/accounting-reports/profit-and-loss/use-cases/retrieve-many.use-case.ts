import { BaseUseCase, type IQuery, type IUseCaseOutputFailed, type IUseCaseOutputSuccess } from '@point-hub/papi';

import type { IAuthorizationService } from '@/modules/_shared/services/authorization.service';
import type { IRetrieveManyRepository as IChartOfAccountRetrieveManyRepository } from '@/modules/chart-of-accounts/repositories/retrieve-many.repository';
import type { IAuthUser } from '@/modules/master/users/interface';

import type { IRetrieveManyRepository } from '../repositories/retrieve-many.repository';

export interface IInput {
  authUser: IAuthUser
  query: IQuery
}

export interface IDeps {
  retrieveManyRepository: IRetrieveManyRepository
  chartOfAccountRetrieveManyRepository: IChartOfAccountRetrieveManyRepository
  authorizationService: IAuthorizationService
}

export interface IBalance {
  coa_number: string
  coa_name: string
  balance: number
}

export interface ISuccessData {
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

/**
 * Use case: Retrieve Journals.
 *
 * Responsibilities:
 * - Check whether the user is authorized to perform this action
 * - Retrieve all data from the database.
 * - Optionally filter response fields using `query.fields`.
 * - Return a success response.
 */
export class RetrieveManyUseCase extends BaseUseCase<IInput, IDeps, ISuccessData> {
  async handle(input: IInput): Promise<IUseCaseOutputSuccess<ISuccessData> | IUseCaseOutputFailed> {
    // Check whether the user is authorized to perform this action
    const isAuthorized = this.deps.authorizationService.hasAccess(input.authUser.role?.permissions, 'journals:read');
    if (!isAuthorized) {
      return this.fail({ code: 403, message: 'You do not have permission to perform this action.' });
    }

    // Retrieve all data from the database.
    const response = await this.deps.retrieveManyRepository.handle(input.query);

    // Return a success response.
    return this.success(response);
  }
}
