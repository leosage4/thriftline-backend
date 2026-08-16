import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} does not exist.`));
}

export function errorHandler(
  error: Error | HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = statusCode >= 500
    ? 'Unexpected backend failure.'
    : error.message;

  if (statusCode === 404) {
    console.warn('[backend warning]', {
      statusCode,
      message: error.message,
    });

    res.status(statusCode).json({ error: message });
    return;
  }

  console.error('[backend error]', {
    statusCode,
    message: error.message,
    stack: error.stack,
  });

  res.status(statusCode).json({ error: message });
}
