// Browser fixture only: the production remote receives these capabilities from erxes.
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { Frame } from "../../frontend/plugins/frame_ui/src/Frame";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Frame />
  </StrictMode>,
);
