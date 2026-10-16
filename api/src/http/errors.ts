import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
  }
}

const CODE_BY_STATUS: Record<number, string> = {
  400: "bad_request",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "rate_limited",
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: error.code });
    }

    // Errors raised by Fastify itself or its plugins (bad JSON, oversized body,
    // wrong content type, rate limit) carry a 4xx statusCode.
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({ error: CODE_BY_STATUS[status] ?? "bad_request" });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });
}
