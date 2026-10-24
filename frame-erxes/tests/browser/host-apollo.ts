// Simulate the host transport only. The production plugin uses erxes' Apollo client.
export const gql = (parts: TemplateStringsArray) => parts.join("");
export function useApolloClient() {
  return {
    async mutate() {
      const response = await fetch("/test/launch", { method: "POST" });
      if (!response.ok) throw new Error("Fixture launch denied.");
      return { data: { frameLaunch: await response.json() } };
    },
  };
}
