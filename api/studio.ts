import { studioResponse } from "../server/studio-response";
Bun.serve({ fetch: studioResponse });
