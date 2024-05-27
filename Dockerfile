FROM node:20-alpine
RUN mkdir -p /app/node_modules
WORKDIR /app
COPY package*.json ./

RUN npm install --save && npm install --save-dev
COPY . .
RUN npm run build
CMD ["node", "/app/dist/main.js"]

