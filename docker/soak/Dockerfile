FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=768

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY . .

RUN yarn install --immutable \
	&& yarn build \
	&& chown -R node:node /app

USER node

ENTRYPOINT ["node", "scripts/soak-wasm.mjs"]
