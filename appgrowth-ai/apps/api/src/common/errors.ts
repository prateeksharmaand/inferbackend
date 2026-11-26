import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Every error leaves as { error: { code, message, details? } }. Stack traces and SQL never reach clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Errors');
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let message = 'Something went wrong';
    let details: unknown;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as string | { message?: string | string[]; code?: string; details?: unknown };
      if (typeof r === 'string') message = r;
      else {
        if (Array.isArray(r.message)) { message = 'Validation failed'; details = r.message; code = 'validation_error'; }
        else if (r.message) message = r.message;
        if (r.code) code = r.code;
        if (r.details !== undefined) details = r.details;
      }
      if (code === 'internal_error') {
        code = ({ 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'payload_too_large', 422: 'unprocessable', 429: 'rate_limited' } as Record<number, string>)[status] ?? 'error';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { status = 409; code = 'conflict'; message = 'A record with these details already exists'; }
      else if (exception.code === 'P2025') { status = 404; code = 'not_found'; message = 'Record not found'; }
      else if (exception.code === 'P2003') { status = 409; code = 'conflict'; message = 'A related record is missing or still in use'; }
      else this.log.error(`${exception.code}: ${exception.message}`);
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError && /row-level security/i.test(exception.message)) {
      status = 404; code = 'not_found'; message = 'Record not found'; // RLS blocked a cross-tenant write
      this.log.warn('RLS rejected a write');
    } else {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
  }
}

export class AppError extends HttpException {
  constructor(message: string, status = 400, code?: string, details?: unknown) {
    super({ message, code, details }, status);
  }
}
export const notFound = (what = 'Record') => new AppError(`${what} not found`, 404, 'not_found');
