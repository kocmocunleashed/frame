# Pin both runtimes; browser installation uses the Playwright version in bun.lock.
FROM docker.io/library/node:22.23.1-bookworm-slim AS browser-tools

FROM docker.io/oven/bun:1.3.14-debian AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN bun run build

FROM docker.io/oven/bun:1.3.14-debian AS runtime
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/frame-browsers
COPY --from=build /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
# The installer and browser driver run on Node. API and workers remain on Bun.
COPY --from=browser-tools /usr/local/bin/node /usr/local/bin/frame-browser-installer
RUN /usr/local/bin/frame-browser-installer node_modules/playwright/cli.js install --with-deps chromium && chmod -R a+rX /opt/frame-browsers && rm -rf /var/lib/apt/lists/* /usr/local/bin/frame-browser-installer
COPY --from=browser-tools /usr/local/bin/node /usr/local/bin/frame-browser-driver
ENV FRAME_NODE_PATH=/usr/local/bin/frame-browser-driver
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/server ./server
COPY --from=build --chown=bun:bun /app/shared ./shared
COPY --from=build --chown=bun:bun /app/src ./src
COPY --from=build --chown=bun:bun /app/scripts ./scripts
USER bun
EXPOSE 3158
CMD ["bun", "server/index.ts"]

FROM runtime AS api
CMD ["bun", "server/index.ts"]
FROM runtime AS worker
CMD ["bun", "server/workers/worker.ts"]
FROM runtime AS dispatcher
CMD ["bun", "server/workers/dispatcher.ts"]
FROM runtime AS maintenance
CMD ["bun", "server/workers/maintenance.ts"]
