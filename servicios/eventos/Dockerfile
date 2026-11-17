FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production TZ=America/Bogota
RUN apk add --no-cache tzdata wget
WORKDIR /app
COPY --from=compilacion /app/package.json ./
COPY --from=compilacion /app/node_modules node_modules
COPY --from=compilacion /app/dist dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:4000/eventos/salud || exit 1
CMD ["node", "dist/index.js"]
