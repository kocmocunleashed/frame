import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, sep } from "node:path";
const readableRoots = ["src", "shared", "node_modules", "index.html"].map((v) =>
  resolve(v),
);
export default defineConfig({
  // Test launchers supply an isolated environment. Do not reload their pages
  // or import developer publishable settings when the local .env changes.
  envDir: process.env.NODE_ENV === "test" ? false : undefined,
  plugins: [
    react(),
    {
      name: "frame-private-files",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let path: string;
          try {
            path = decodeURIComponent(
              new URL(req.url || "/", "http://localhost").pathname,
            );
          } catch {
            res.statusCode = 400;
            res.end();
            return;
          }
          const file = path.startsWith("/@fs/") ? resolve(path.slice(4)) : null;
          if (
            /^\/(server|tests|scripts|infra|frame-erxes|\.frame-data|\.git|\.aws)(\/|$)/.test(
              path,
            ) ||
            /^\/\.env(?:\.|$)/.test(path) ||
            (file &&
              !readableRoots.some(
                (root) => file === root || file.startsWith(root + sep),
              ))
          ) {
            res.statusCode = 403;
            res.end("Private application files are not served.");
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.FRAME_WEB_PORT || 5174),
    strictPort: true,
    fs: {
      strict: true,
      allow: [
        resolve("src"),
        resolve("shared"),
        resolve("node_modules"),
        resolve("index.html"),
      ],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        `${resolve(".frame-data")}/**`,
        `${resolve(process.env.FRAME_ASSETS || ".frame-data/assets")}/**`,
        `${resolve(process.env.FRAME_EXPORTS || ".frame-data/exports")}/**`,
      ],
    },
    watch: {
      // Native plugin packaging creates HTML outside this SPA. Watching it would
      // reload an editor in the middle of a gesture or an acceptance test.
      ignored: [
        "**/.frame-data/**",
        "**/frame-erxes/**",
        "**/infra/**",
        "**/dist/**",
      ],
      // Keep the last valid module while an editor truncates and rewrites a file.
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    },
    proxy: {
      ...(process.env.NODE_ENV === "test"
        ? {
            "/__fixture": `http://127.0.0.1:${process.env.FRAME_API_PORT || 3158}`,
          }
        : {}),
      "/api": `http://127.0.0.1:${process.env.FRAME_API_PORT || 3158}`,
      "/integrations/erxes": `http://127.0.0.1:${process.env.FRAME_API_PORT || 3158}`,
    },
  },
  build: { outDir: "dist" },
});
