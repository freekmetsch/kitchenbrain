# Railway deploy image (P1.0): SvelteKit adapter-node app supervised by
# Litestream for streaming SQLite replication to Cloudflare R2.
# Railway service settings must use builder=Dockerfile with NO build/start
# command overrides, or this image's CMD is bypassed and Litestream never runs.
FROM node:22-slim AS build
WORKDIR /app
# npm ci runs the `prepare` script (paraglide i18n:compile + svelte-kit sync),
# which reads project.inlang/ and messages/ — copy them into the dependency
# layer or the compile dies with ENOENT before the full source COPY below.
COPY package.json package-lock.json svelte.config.js ./
COPY project.inlang ./project.inlang
COPY messages ./messages
RUN npm ci
COPY . .
RUN DATABASE_URL=./build.db npx vite build
RUN npm prune --omit=dev

FROM node:22-slim
WORKDIR /app

ARG LITESTREAM_VERSION=0.5.13
ARG LITESTREAM_SHA256=b911f2237fb63a22588cffacc9b6dd0845cf0af0492af207436b5f7588896f4a
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.deb /tmp/litestream.deb
RUN echo "${LITESTREAM_SHA256}  /tmp/litestream.deb" | sha256sum -c - \
	&& dpkg -i /tmp/litestream.deb \
	&& rm /tmp/litestream.deb

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Runtime file dependencies read via process.cwd(): boot migrations + prompts.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/lib/server/ai/prompts ./src/lib/server/ai/prompts

COPY litestream.yml /etc/litestream.yml
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

ENV NODE_ENV=production
EXPOSE 3000
CMD ["./start.sh"]
