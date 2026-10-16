import type { FastifyInstance } from "fastify";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF defence next to SameSite=Lax: every state-changing request must carry an
// Origin header naming this app. Browsers always send it on POST/PUT/PATCH/DELETE,
// and a malicious page cannot forge it. Non-browser clients (curl) must send it too.
export function registerOriginGuard(app: FastifyInstance, allowedOrigins: string[]): void {
  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: "forbidden_origin" });
    }
  });
}
