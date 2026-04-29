import 'express';

import type { IMakeControllerInput, IMakeMiddlewareInput, IMiddleware } from '@point-hub/papi';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { IAuthUser } from './modules/master/users/interface';

declare module 'express-serve-static-core' {
  interface Request {
    authUser: IAuthUser
  }
}

export const makeController = (makeControllerInput: IMakeControllerInput) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await makeControllerInput.controller({
      req,
      res,
      next,
      dbConnection: makeControllerInput.dbConnection,
    });
  };
};

const isExpressMiddleware = (fn: IMiddleware): fn is RequestHandler => {
  return fn.length >= 3;
};

export const makeMiddleware = (makeMiddlewareInput: IMakeMiddlewareInput) => {
  const { middleware, dbConnection } = makeMiddlewareInput;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (isExpressMiddleware(middleware)) {
      return middleware(req, res, next);
    }

    await middleware({
      req,
      res,
      next,
      dbConnection,
    });

    next();
  };
};
