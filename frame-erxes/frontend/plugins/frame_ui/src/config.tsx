import type { IUIConfig } from "erxes-ui";
import { IconPresentation } from "@tabler/icons-react";

export const CONFIG: IUIConfig = {
  name: "frame",
  path: "frame",
  icon: IconPresentation,
  navigationGroup: {
    name: "Frame",
    defaultPath: "frame",
    icon: IconPresentation,
  },
  modules: [
    {
      name: "studio",
      path: "frame",
      icon: IconPresentation,
    },
  ],
};
