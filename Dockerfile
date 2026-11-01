# Etapa 1: compila la PWA.
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

# Etapa 2: compila la API.
FROM node:24-alpine AS api
WORKDIR /api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

# Etapa 3: imagen final, solo con dependencias de producción y sin privilegios de root.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV CARPETA_WEB=/app/web
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=api /api/dist ./dist
COPY --from=web /web/dist ./web
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
