import openNextWorker, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";
import { refreshFilesSummaryWithConnectionString } from "./lib/db";

function getScheduledConnectionString(env) {
  return (
    env?.HYPERDRIVE?.connectionString ||
    env?.POSTGRES_URL ||
    env?.DATABASE_URL ||
    ""
  );
}

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

export default {
  async fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(_event, env, ctx) {
    const connectionString = getScheduledConnectionString(env);
    if (!connectionString) {
      console.error("Missing connection string for scheduled files_summary refresh");
      return;
    }

    ctx.waitUntil(
      refreshFilesSummaryWithConnectionString(connectionString).catch((error) => {
        console.error("Failed to refresh files_summary materialized view", error);
      }),
    );
  },
};
