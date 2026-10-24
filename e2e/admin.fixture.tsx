// Component acceptance harness. Production continues to authenticate with Clerk.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "../src/styles.css";
import Admin from "../src/components/Admin";
import CreditBalance, { useCredits } from "../src/components/CreditBalance";
function Balance() {
  return (
    <main>
      <h1>Your credits</h1>
      <CreditBalance {...useCredits()} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("view") === "balance" ? (
    <Balance />
  ) : (
    <Admin />
  ),
);
