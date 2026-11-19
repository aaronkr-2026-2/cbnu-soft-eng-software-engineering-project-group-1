FROM node:24.12.0 AS build
WORKDIR /usr/src/medconnect/backend
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.12.0 AS runtime
ENV NODE_ENV=production
WORKDIR /usr/src/medconnect/backend
COPY --from=build /usr/src/medconnect/backend/package.json ./package.json
COPY --from=build /usr/src/medconnect/backend/node_modules ./node_modules
COPY --from=build /usr/src/medconnect/backend/dist ./dist
RUN mkdir -p uploads
CMD ["node", "dist/main.js"]
