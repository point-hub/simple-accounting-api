import { BaseUseCase, type IUseCaseOutputFailed, type IUseCaseOutputSuccess } from '@point-hub/papi';
import { parse } from 'csv-parse';
import fs from 'fs';
import fsPromises from 'fs/promises';

import type { IAuthorizationService } from '@/modules/_shared/services/authorization.service';
import type { IUniqueValidationService } from '@/modules/_shared/services/unique-validation.service';
import type { IUserAgent } from '@/modules/_shared/types/user-agent.type';
import type { IAblyService } from '@/modules/ably/services/ably.service';
import type { IAuditLogService } from '@/modules/audit-logs/services/audit-log.service';
import type { ICodeGeneratorService } from '@/modules/counters/services/code-generator.service';
import type { IAuthUser } from '@/modules/master/users/interface';

import { ChartOfAccountEntity } from '../entity';
import type { IChartOfAccount } from '../interface';
import type { ICreateManyRepository } from '../repositories/create-many.repository';
import type { IDeleteManyRepository } from '../repositories/delete-many.repository';

export interface IFile {
  fieldname: string,
  originalname: string,
  encoding: string,
  mimetype: string,
  destination: string,
  filename: string,
  path: string,
  size: number,
}

export interface IData {
  type: string
  category: string
  number: string
  name: string
}

export interface IInput {
  ip: string
  authUser: IAuthUser
  userAgent: IUserAgent
  file: IFile
}

export interface IDeps {
  createManyRepository: ICreateManyRepository
  deleteManyRepository: IDeleteManyRepository
  ablyService: IAblyService
  auditLogService: IAuditLogService
  authorizationService: IAuthorizationService
  codeGeneratorService: ICodeGeneratorService
  uniqueValidationService: IUniqueValidationService
}

export interface ISuccessData {
  inserted_count: number
}

export class ImportUseCase extends BaseUseCase<IInput, IDeps, ISuccessData> {
  async handle(input: IInput): Promise<IUseCaseOutputSuccess<ISuccessData> | IUseCaseOutputFailed> {
    const BATCH_SIZE = 500;
    const file = input.file;

    if (!file?.path) {
      return this.fail({ code: 422, message: 'File not found' });
    }

    const filePath = file.path;

    const seenNumber = new Set<string>();
    const seenName = new Set<string>();

    let rowCount = 2;
    let validRowCount = 0;

    const validTypes = [
      'Asset',
      'Liability',
      'Equity',
      'Income',
      'Expense',
    ];

    const validCategories = [
      'Current Asset',
      'Fixed Asset',
      'Accumulated Depreciation',
      'Current Liability',
      'Long-Term Liability',
      'Owner Equity',
      'Dividend',
      'Retained Earning',
      'Net Income',
      'Operating Income',
      'Non-Operating Income',
      'Cost of Sales',
      'Factory Overhead Cost',
      'Operating Expense',
      'Non-Operating Expense',
    ];

    const categoryByType: Record<string, string[]> = {
      Asset: [
        'Current Asset',
        'Fixed Asset',
        'Accumulated Depreciation',
      ],
      Liability: [
        'Current Liability',
        'Long-Term Liability',
      ],
      Equity: [
        'Owner Equity',
        'Dividend',
        'Retained Earning',
        'Net Income',
      ],
      Income: [
        'Operating Income',
        'Non-Operating Income',
      ],
      Expense: [
        'Cost of Sales',
        'Factory Overhead Cost',
        'Operating Expense',
        'Non-Operating Expense',
      ],
    };

    try {
      /**
       * Validate data
       */
      const validationStream = fs.createReadStream(filePath);
      const validationParser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      validationStream.pipe(validationParser);

      for await (const row of validationParser as AsyncIterable<IData>) {
        if (!row.type) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "type" is empty at row ${rowCount}`,
          });
        }

        if (!row.category) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "category" is empty at row ${rowCount}`,
          });
        }

        if (!row.number) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "number" is empty at row ${rowCount}`,
          });
        }

        if (!row.name) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "name" is empty at row ${rowCount}`,
          });
        }

        if (seenNumber.has(row.number)) {
          return this.fail({
            code: 422,
            message: `Import failed: duplicate field "number" at row ${rowCount}`,
          });
        }

        if (seenName.has(row.name)) {
          return this.fail({
            code: 422,
            message: `Import failed: duplicate field "name" at row ${rowCount}`,
          });
        }

        if (!validTypes.includes(row.type)) {
          return this.fail({
            code: 422,
            message: `Import failed: invalid type "${row.type}" at row ${rowCount}`,
          });
        }

        if (!validCategories.includes(row.category)) {
          return this.fail({
            code: 422,
            message: `Import failed: invalid category "${row.category}" at row ${rowCount}`,
          });
        }

        if (!categoryByType[row.type].includes(row.category)) {
          return this.fail({
            code: 422,
            message: `Import failed: category "${row.category}" does not belong to type "${row.type}" at row ${rowCount}`,
          });
        }

        seenNumber.add(row.number);
        seenName.add(row.name);

        rowCount++;
        validRowCount++;
      }

      if (validRowCount === 0) {
        return this.fail({
          code: 422,
          message: 'Import failed: file contains no data',
        });
      }

      /**
       * Delete existing data and insert new data
       */
      await this.deps.deleteManyRepository.handle({});

      const insertStream = fs.createReadStream(filePath);
      const insertParser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      insertStream.pipe(insertParser);

      let batch: IChartOfAccount[] = [];
      let insertedCount = 0;

      const processBatch = async (batch: IChartOfAccount[]) => {
        await this.deps.createManyRepository.handle(batch);
        insertedCount += batch.length;
      };

      for await (const row of insertParser as AsyncIterable<IData>) {
        const entity = new ChartOfAccountEntity({
          ...row,
          created_at: new Date(),
          created_by_id: input.authUser._id,
        });

        batch.push(entity.data);

        if (batch.length >= BATCH_SIZE) {
          await processBatch(batch);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await processBatch(batch);
      }

      return this.success({
        inserted_count: insertedCount,
      });

    } catch {
      return this.fail({
        code: 500,
        message: 'Internal server error',
      });
    } finally {
      // cleanup uploaded file
      if (filePath) {
        try {
          await fsPromises.unlink(filePath);
        } catch (err) {
          console.error('Failed to delete file:', err);
        }
      }
    }
  }
}