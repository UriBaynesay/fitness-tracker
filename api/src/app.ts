import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/index.js";
import { registerErrorHandler } from "./http/errors.js";
import { registerOriginGuard } from "./http/origin-guard.js";
import { registerAuthRoutes, type RateLimitOptions } from "./routes/auth.js";
import { registerExerciseRoutes } from "./routes/exercises.js";
import { registerGoalRoutes } from "./routes/goals.js";
import { registerPlanRoutes } from "./routes/plans.js";
import { registerSessionRoutes } from "./routes/sessions.js";

export const DEFAULT_RATE_LIMITS: { login: RateLimitOptions; register: RateLimitOptions } = {
  login: { max: 10, timeWindow: "1 minute" },
  register: { max: 5, timeWindow: "1 hour" },
};

// api/{src,dist}/app.js -> ../../web/dist, in dev and in the production image alike.
const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

export interface BuildAppOptions {
  config: Config;
  db: Db;
  rateLimits?: { login: RateLimitOptions; register: RateLimitOptions };
  // null disables static serving (tests); undefined uses the default location.
  webDist?: string | null;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const isProduction = config.NODE_ENV === "production";

  const app = Fastify({
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
              censor: "[redacted]",
            },
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 100 * 1024,
  });

  // JSON only. Fastify also accepts text/plain by default, which is exactly what a
  // cross-site HTML form can send without a CORS preflight.
  app.removeContentTypeParser("text/plain");

  await app.register(helmet, {
    // HSTS is a deliberate, separate decision made at the nginx level.
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { upgradeInsecureRequests: isProduction ? [] : null },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, error: "rate_limited" }),
  });

  registerErrorHandler(app);
  registerOriginGuard(app, config.ALLOWED_ORIGINS);

  app.addHook("onSend", async (request, reply) => {
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  registerAuthRoutes(app, { db, config, rateLimits: options.rateLimits ?? DEFAULT_RATE_LIMITS });
  registerExerciseRoutes(app, { db, config });
  registerPlanRoutes(app, { db, config });
  registerSessionRoutes(app, { db, config });
  registerGoalRoutes(app, { db, config });

  const webDist = options.webDist === undefined ? DEFAULT_WEB_DIST : options.webDist;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      // Hashed build assets never change; index.html must always be revalidated.
      setHeaders(res, filePath) {
        res.header(
          "Cache-Control",
          filePath.includes("assets") ? "public, max-age=31536000, immutable" : "no-cache"
        );
      },
    });
    // Single-page app: any other GET that is not the API gets index.html and the
    // client-side router takes over.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}
