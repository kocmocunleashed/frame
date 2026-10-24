export const MUSE_CONTRIBUTOR_MODEL = "meta/muse-spark-1.3-contributor";
export const GEMMA4_MODEL = "google/gemma-4-31b-it";

export type PinnedOpenRouterModel = {
  id: typeof MUSE_CONTRIBUTOR_MODEL | typeof GEMMA4_MODEL;
  label: string;
  inputPrice: number;
  outputPrice: number;
  maxOutputTokens: number;
  providers?: string[];
};

// Application ceilings per million tokens; live catalog checks still apply.
export const PINNED_OPENROUTER_MODELS: readonly PinnedOpenRouterModel[] = [
  {
    id: MUSE_CONTRIBUTOR_MODEL,
    label: "Muse Spark 1.3 Contributor",
    inputPrice: 0.1,
    outputPrice: 0.2,
    maxOutputTokens: 20000,
    providers: ["meta"],
  },
  {
    id: GEMMA4_MODEL,
    label: "Gemma 4 31B",
    inputPrice: 0.2,
    outputPrice: 0.4,
    maxOutputTokens: 16384,
  },
];
