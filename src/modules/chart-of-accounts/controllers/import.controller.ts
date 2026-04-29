import type { IController, IControllerInput } from '@point-hub/papi';

import { AuthorizationService } from '@/modules/_shared/services/authorization.service';
import { UniqueValidationService } from '@/modules/_shared/services/unique-validation.service';
import { AblyService } from '@/modules/ably/services/ably.service';
import { AuditLogService } from '@/modules/audit-logs/services/audit-log.service';
import { CodeGeneratorService } from '@/modules/counters/services/code-generator.service';

import { CreateManyRepository } from '../repositories/create-many.repository';
import { DeleteManyRepository } from '../repositories/delete-many.repository';
import { type IFile, ImportUseCase } from '../use-cases/import.use-case';

export const importController: IController = async (controllerInput: IControllerInput) => {
  let session;
  try {
    // Start database session for transaction
    session = controllerInput.dbConnection.startSession();
    session.startTransaction();

    // Initialize repositories and utilities
    const createManyRepository = new CreateManyRepository(controllerInput.dbConnection, { session });
    const deleteManyRepository = new DeleteManyRepository(controllerInput.dbConnection, { session });
    const auditLogService = new AuditLogService(controllerInput.dbConnection, { session });
    const codeGeneratorService = new CodeGeneratorService(controllerInput.dbConnection, { session });
    const uniqueValidationService = new UniqueValidationService(controllerInput.dbConnection, { session });

    // Initialize use case with dependencies
    const importUseCase = new ImportUseCase({
      createManyRepository,
      deleteManyRepository,
      ablyService: AblyService,
      auditLogService,
      authorizationService: AuthorizationService,
      codeGeneratorService,
      uniqueValidationService,
    });

    // Execute business logic
    const response = await importUseCase.handle({
      authUser: controllerInput.req['authUser'],
      userAgent: JSON.parse(
        Array.isArray(controllerInput.req.headers['client-user-agent'])
          ? controllerInput.req.headers['client-user-agent'][0]
          : controllerInput.req.headers['client-user-agent'] ?? '{}',
      ),
      ip: controllerInput.req.ip ?? '',
      file: controllerInput.req['file'] as unknown as IFile,
    });

    // Handle failed response
    if (response.status === 'failed') {
      controllerInput.res.status(response.error.code);
      controllerInput.res.statusMessage = response.error.message;
      controllerInput.res.json(response.error);
      return;
    }

    // Commit transaction and send response
    await session.commitTransaction();
    controllerInput.res.status(201);
    controllerInput.res.json(response.data);
  } catch (error) {
    await session?.abortTransaction();
    throw error;
  } finally {
    await session?.endSession();
  }
};
