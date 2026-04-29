import { Router } from 'express';
import multer from 'multer';

import type { IBaseAppInput } from '@/app';
import { makeController, makeMiddleware } from '@/express';
import { authMiddleware } from '@/middlewares/auth.middleware';
import type { IRoute } from '@/router';

import * as controller from './controllers/index';

const upload = multer({ dest: 'uploads/' });

const makeRouter = async ({ dbConnection }: IBaseAppInput) => {
  const router = Router();

  const routes: IRoute[] = [
    {
      method: 'get',
      path: '/',
      middlewares: [makeMiddleware({ middleware: authMiddleware, dbConnection })],
      controller: controller.retrieveManyController,
    },
    {
      method: 'get',
      path: '/subledgers',
      middlewares: [makeMiddleware({ middleware: authMiddleware, dbConnection })],
      controller: controller.subledgersController,
    }, {
      method: 'post',
      path: '/import',
      middlewares: [
        makeMiddleware({ middleware: authMiddleware, dbConnection }),
        upload.single('file'),
      ],
      controller: controller.importController,
    },
  ];

  routes.forEach(({ method, path, controller, middlewares }) => {
    router[method](path, ...(middlewares ?? []), makeController({ controller, dbConnection }));
  });

  return router;
};

export default makeRouter;