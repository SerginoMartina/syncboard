FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js db.js ./
COPY routes ./routes
COPY database ./database

EXPOSE 3000

CMD ["npm", "start"]
