import { Store as ProductionStore } from "../server/store";
import { createHash } from "node:crypto";
export class Store extends ProductionStore {
  readonly testReady: Promise<void>;
  constructor(label = ":memory:") {
    const uri = process.env.FRAME_TEST_MONGODB_URI;
    if (!uri || !/^mongodb:\/\/127\.0\.0\.1:\d+\/frame_test_/.test(uri))
      throw new Error(
        "Integration tests require the isolated replica-set harness: bun run test",
      );
    const id =
      label === ":memory:"
        ? crypto.randomUUID().replaceAll("-", "")
        : createHash("sha256").update(label).digest("hex").slice(0, 24);
    super(uri, "frame_test_" + id);
    this.testReady = super.migrate();
    const transact = this.db.transaction.bind(this.db);
    this.db.transaction =
      <T>(fn: () => T | Promise<T>) =>
      async () => {
        await this.testReady;
        return transact(fn)();
      };
    const close = this.db.close.bind(this.db);
    this.db.close = async () => {
      await this.testReady;
      await close();
    };
    return new Proxy(this, {
      get: (target, key, receiver) => {
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== "function" || key === "constructor") return value;
        return async (...args: unknown[]) => {
          await target.testReady;
          return value.apply(target, args);
        };
      },
    });
  }
}
