# Etapa 1: compila TypeScript con todas las dependencias.
FROM node:24-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Etapa 2: imagen final, solo con dependencias de producción y sin privilegios de root.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=compilacion /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
