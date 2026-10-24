import { Users, WifiOff } from "lucide-react";
import type { usePresence } from "../lib/usePresence";
export default function PresenceBadge({
  presence,
}: {
  presence: ReturnType<typeof usePresence>;
}) {
  const peers = presence.state?.peers || [];
  return (
    <div
      className={`presence-badge ${!presence.connected ? "offline" : ""}`}
      role="status"
      title={peers
        .map((p) => `${p.name} · ${p.mode === "edit" ? "editing" : "viewing"}`)
        .join("\n")}
    >
      {presence.connected ? <Users size={13} /> : <WifiOff size={13} />}
      <span>
        {presence.denied
          ? "Access changed"
          : !presence.connected
            ? "Reconnecting…"
            : !presence.state
              ? "Connecting…"
              : peers.length
                ? `${peers
                    .map((p) => p.name)
                    .slice(0, 2)
                    .join(
                      ", ",
                    )}${peers.length > 2 ? ` +${peers.length - 2}` : ""} here`
                : "Only you here"}
      </span>
    </div>
  );
}
