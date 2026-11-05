import { Store } from "./store";
import { configuration } from "./config";
import { createApp } from "./app";
import { createAIServices } from "./creation";
import { dispatchReady } from "./dispatch";
let cached: ReturnType<typeof initialize> | undefined;
async function initialize() {
  configuration();
  const store = new Store();
  await store.db.ready;
  if (!(await store.db.migrationReady()))
    throw new Error("Apply reviewed database migrations before deploying.");
  return { store, app: createApp(store) };
}
export const runtime = () => (cached ||= initialize());
export async function dispatchPending(store: Store) {
  const ai = createAIServices(store);
  await ai.queue.recover();
  await ai.workflows.reconcile();
  return dispatchReady(store);
}
