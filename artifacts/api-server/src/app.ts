import express, { type Express, type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  req.log.error({ errorType: err?.name }, "Request failed");
  if (res.headersSent) { res.end(); return; }
  const status = err?.type === "entity.too.large" ? 413 : err instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 413 ? "Input is too large." : status === 400 ? "Invalid JSON request." : "Unable to complete this request. Please try again." });
};
app.use(errorHandler);

export default app;
