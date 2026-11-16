# Server game Astra Legion (Node.js + Socket.IO) beserta client hasil build.
#   docker build -t astra-legion .
#   docker run -p 3000:3000 astra-legion      -> buka http://localhost:3000

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BASE_PATH=
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/server/index.cjs"]
