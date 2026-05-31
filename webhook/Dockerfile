FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json server.js ./
CMD ["node", "server.js"]
