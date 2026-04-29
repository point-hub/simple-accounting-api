import { BaseUseCase, type IQuery, type IUseCaseOutputFailed, type IUseCaseOutputSuccess } from '@point-hub/papi';

import type { IAuthorizationService } from '@/modules/_shared/services/authorization.service';
import type { IRetrieveManyRepository as IChartOfAccountRetrieveManyRepository } from '@/modules/chart-of-accounts/repositories/retrieve-many.repository';
import type { IAuthUser } from '@/modules/master/users/interface';

import type { IOpeningBalanceRepository } from '../repositories/opening-balance.repository';
import type { IRetrieveManyRepository } from '../repositories/retrieve-many.repository';

export interface IInput {
  authUser: IAuthUser
  query: IQuery
}

export interface IDeps {
  retrieveManyRepository: IRetrieveManyRepository
  chartOfAccountRetrieveManyRepository: IChartOfAccountRetrieveManyRepository
  openingBalanceRepository: IOpeningBalanceRepository
  authorizationService: IAuthorizationService
}

export interface ISuccessData {
  data: {
    _id?: string
    number?: string
    name?: string
    type?: string
    category?: string
    created_at?: Date
    created_by?: IAuthUser
  }[]
  opening_balance: number
  pagination: {
    page: number
    page_count: number
    page_size: number
    total_document: number
  }
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

    if (!input.query['search.coa_number']) {
      return this.success({
        data: [],
        opening_balance: 0,
        pagination: {
          page: 1,
          page_count: 0,
          page_size: 0,
          total_document: 0,
        },
      });
    }

    // Retrieve all data from the database.
    const response = await this.deps.retrieveManyRepository.handle(input.query);
    let openingBalance = await this.deps.openingBalanceRepository.handle(input.query);

    // Optionally filter response fields using `query.fields`.
    const fields = typeof input.query.fields === 'string'
      ? input.query.fields.split(',').map(f => f.trim())
      : null;

    const chartOfAccount = await this.deps.chartOfAccountRetrieveManyRepository.handle({
      ['search.number']: input.query['search.coa_number'],
    });

    if (!chartOfAccount.data.length) {
      return this.success({
        data: [],
        opening_balance: 0,
        pagination: {
          page: 1,
          page_count: 0,
          page_size: 0,
          total_document: 0,
        },
      });
    }

    if (chartOfAccount.data[0].type === 'Liability' || chartOfAccount.data[0].type === 'Equity' || chartOfAccount.data[0].type === 'Income') {
      openingBalance *= -1;
    }
    let runningBalance = openingBalance;

    // Return a success response.
    return this.success({
      data: response.data.map(item => {
        if (chartOfAccount.data[0].type === 'Asset' || chartOfAccount.data[0].type === 'Expense') {
          runningBalance += (item.debit - item.credit);
        } else {
          runningBalance += (item.credit - item.debit);
        }

        const mapped = {
          _id: item._id,
          date: item.date,
          form_number: item.form_number,
          coa_number: item.coa_number,
          coa_name: item.coa_name,
          subledger: item.subledger,
          description: item.description,
          debit: item.debit,
          credit: item.credit,
          balance: runningBalance,
          created_at: item.created_at,
          created_by: {
            _id: item.created_by?._id,
            username: item.created_by?.username,
            name: item.created_by?.name,
            email: item.created_by?.email,
          },
        };

        // If no fields requested → return full object
        if (!fields) return mapped;

        // Otherwise → return only requested fields
        return Object.fromEntries(
          Object.entries(mapped).filter(([key]) => fields.includes(key)),
        );
      }),
      opening_balance: openingBalance ?? 0,
      pagination: response.pagination,
    });
  }
}
