export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export type AuthCapabilities = { providers: SocialProvider[]; email: boolean };
export const providerName = (provider: string) =>
  provider === "google"
    ? "Google"
    : provider === "github"
      ? "GitHub"
      : provider;
