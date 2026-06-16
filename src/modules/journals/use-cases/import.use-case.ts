import { BaseUseCase, type IUseCaseOutputFailed, type IUseCaseOutputSuccess } from '@point-hub/papi';
import { parse } from 'csv-parse';
import fs from 'fs';
import fsPromises from 'fs/promises';

import type { IAuthorizationService } from '@/modules/_shared/services/authorization.service';
import type { IUniqueValidationService } from '@/modules/_shared/services/unique-validation.service';
import type { IUserAgent } from '@/modules/_shared/types/user-agent.type';
import type { IAblyService } from '@/modules/ably/services/ably.service';
import type { IAuditLogService } from '@/modules/audit-logs/services/audit-log.service';
import type { IRetrieveManyRepository } from '@/modules/chart-of-accounts/repositories/retrieve-many.repository';
import type { ICodeGeneratorService } from '@/modules/counters/services/code-generator.service';
import type { IAuthUser } from '@/modules/master/users/interface';

import { JournalEntity } from '../entity';
import type { IJournal } from '../interface';
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
  date: Date
  form_number: string
  coa_number: string
  coa_name: string
  subledger: string
  description: string
  debit: number
  credit: number
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
  chartOfAccountRetrieveManyRepository: IRetrieveManyRepository
  ablyService: IAblyService
  auditLogService: IAuditLogService
  authorizationService: IAuthorizationService
  codeGeneratorService: ICodeGeneratorService
  uniqueValidationService: IUniqueValidationService
  validateDateFormat: (value: string) => boolean
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

    let rowCount = 2;
    let validRowCount = 0;

    const journalBalanceMap = new Map<string, { debit: number; credit: number }>();

    const coaList = await this.deps.chartOfAccountRetrieveManyRepository.raw({
      page_size: 999999999,
    });
    const coaSet = new Set<string>();

    const normalize = (val: string) => val.trim().toLowerCase();

    for (const coa of coaList.data) {
      const key = `${normalize(coa.number!)}||${normalize(coa.name!)}`;
      coaSet.add(key);
    }

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
        const journalEntity = new JournalEntity({
          ...row,
          created_at: new Date(),
          created_by_id: input.authUser._id,
        });

        if (!journalEntity.data.date) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "date" is empty at row ${rowCount}`,
          });
        }

        if (!this.deps.validateDateFormat(String(row.date))) {
          return this.fail({
            code: 422,
            message: `Import failed: invalid date format at row ${rowCount}. Expected yyyy-MM-dd or yyyy-MM-dd HH:mm (ex: 2025-12-31 23:59)`,
          });
        }

        if (!journalEntity.data.form_number) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "form_number" is empty at row ${rowCount}`,
          });
        }

        if (!journalEntity.data.coa_number) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "coa_number" is empty at row ${rowCount}`,
          });
        }

        if (!journalEntity.data.coa_name) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "coa_name" is empty at row ${rowCount}`,
          });
        }

        if (!journalEntity.data.description) {
          return this.fail({
            code: 422,
            message: `Import failed: required field "description" is empty at row ${rowCount}`,
          });
        }

        const coaNumber = journalEntity.data.coa_number;
        const coaName = journalEntity.data.coa_name;

        const key = `${normalize(coaNumber)}||${normalize(coaName)}`;

        if (!coaSet.has(key)) {
          return this.fail({
            code: 422,
            message: `Import failed: coa_number "${coaNumber}" and coa_name "${coaName}" combination not found at row ${rowCount}`,
          });
        }

        // safe numeric parsing
        const debit = Number(journalEntity.data.debit || 0);
        const credit = Number(journalEntity.data.credit || 0);

        if (isNaN(debit) || isNaN(credit)) {
          return this.fail({
            code: 422,
            message: `Import failed: debit/credit must be a number at row ${rowCount}`,
          });
        }

        if (debit === 0 && credit === 0) {
          return this.fail({
            code: 422,
            message: `Import failed: both debit and credit are 0 at row ${rowCount}`,
          });
        }

        const formNumber = journalEntity.data.form_number;

        const current = journalBalanceMap.get(formNumber) || { debit: 0, credit: 0 };

        current.debit += debit;
        current.credit += credit;

        journalBalanceMap.set(formNumber, current);

        rowCount++;
        validRowCount++;
      }

      // prevent empty import
      if (validRowCount === 0) {
        return this.fail({
          code: 422,
          message: 'Import failed: file contains no data',
        });
      }

      // validate balance per form_number
      for (const [formNumber, balance] of journalBalanceMap.entries()) {
        if (balance.debit !== balance.credit) {
          return this.fail({
            code: 422,
            message: `Import failed: journal not balanced for form_number "${formNumber}" (debit: ${balance.debit}, credit: ${balance.credit})`,
          });
        }
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

      let batch: IJournal[] = [];
      let insertedCount = 0;

      const processBatch = async (batch: IJournal[]) => {
        await this.deps.createManyRepository.handle(batch);
        insertedCount += batch.length;
      };

      for await (const row of insertParser as AsyncIterable<IData>) {
        const journalEntity = new JournalEntity({
          ...row,
          created_at: new Date(),
          created_by_id: input.authUser._id,
        });

        batch.push(journalEntity.data);

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