# Imagen del backend de Parkway (API REST + aplicación web compilada).
# La misma imagen corre en cada réplica; NODO_ID distingue a cada una.
FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN npm ci --prefix backend --include=dev && npm ci --prefix frontend --include=dev
COPY backend backend
COPY frontend frontend
RUN npm run build --prefix backend && npm run build --prefix frontend \
 && npm prune --omit=dev --prefix backend

FROM node:22-alpine
ENV NODE_ENV=production TZ=America/Bogota
RUN apk add --no-cache tzdata wget
WORKDIR /app
COPY --from=compilacion /app/backend/package.json backend/
COPY --from=compilacion /app/backend/node_modules backend/node_modules
COPY --from=compilacion /app/backend/dist backend/dist
COPY --from=compilacion /app/frontend/dist frontend/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "backend/dist/index.js"]
