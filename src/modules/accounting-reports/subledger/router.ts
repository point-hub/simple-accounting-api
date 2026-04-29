import { Router } from 'express';

import type { IBaseAppInput } from '@/app';
import { makeController, makeMiddleware } from '@/express';
import { authMiddleware } from '@/middlewares/auth.middleware';
import type { IRoute } from '@/router';

import * as controller from './controllers/index';

const makeRouter = async ({ dbConnection }: IBaseAppInput) => {
  const router = Router();

  const routes: IRoute[] = [
    {
      method: 'get',
      path: '/',
      middlewares: [makeMiddleware({ middleware: authMiddleware, dbConnection })],
      controller: controller.retrieveManyController,
    },
  ];

  routes.forEach(({ method, path, controller, middlewares }) => {
    router[method](path, ...(middlewares ?? []), makeController({ controller, dbConnection }));
  });

  return router;
};

export default makeRouter;