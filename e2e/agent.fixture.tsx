// Actual creation UI against the isolated server's authenticated test account.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "../src/styles.css";
import "../src/creative.css";
import "../src/slide.css";
import "../src/creation.css";
import Creation from "../src/components/Creation";
import Workspace from "../src/components/Workspace";
const { user } = await (await fetch("/api/me")).json();
const id = new URLSearchParams(location.search).get("draft")!;
createRoot(document.getElementById("root")!).render(<Fixture />);

function Fixture() {
  const [account, setAccount] = useState(user);
  return id ? (
    <Creation id={id} user={account} />
  ) : (
    <Workspace
      user={account}
      onUser={setAccount}
      onSignout={() => {}}
      externalAccountUrl="https://work.example.test"
    />
  );
}
