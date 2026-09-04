import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";

export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.headers["x-request-id"] || "n/a";

  if (err instanceof ZodError) {
    logger.warn("validation_error", { requestId, path: req.path, issues: err.issues });
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details: err.issues },
    });
  }

  if (err instanceof AppError) {
    logger.warn("app_error", { requestId, path: req.path, code: err.code, message: err.message });
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  logger.error("unhandled_error", {
    requestId,
    path: req.path,
    message: err instanceof Error ? err.message : "Unknown error",
  });

  // Never leak stack traces to the client.
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}

export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
