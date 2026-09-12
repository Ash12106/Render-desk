FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci

COPY . .

ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist

EXPOSE 3000

ENV CLIENT_DIST_DIR=/app/client/dist
CMD ["node", "server/dist/index.cjs"]
