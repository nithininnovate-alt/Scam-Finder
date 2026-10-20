import app from "./app";
import { logger } from "./lib/logger";
import { purgeExpiredScans } from "./lib/scamfind-store";
import { processEmailQueue } from "./lib/scamfind-email";
import { probeWebRisk } from "./lib/scamfind-webrisk";
import { ensureNumverifyQuotaSchema } from "./lib/scamfind-numverify-quota";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await ensureNumverifyQuotaSchema();
} catch {
  logger.error("Unable to prepare phone quota settings; server was not started");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const purge = () => purgeExpiredScans().catch(() => logger.error("Unable to purge expired cases"));
  void purge();
  setInterval(purge, 3600000).unref();
  const emailQueue = () => processEmailQueue().catch(() => logger.error("Unable to process email notification queue"));
  void emailQueue();
  setInterval(emailQueue, 20000).unref();
  // Probe only a fixed public example, never offer data. Actual offer lookups
  // remain opt-in and an unavailable provider never produces a clean result.
  void probeWebRisk().catch(() => logger.error("Web Risk health check could not be completed"));
});
