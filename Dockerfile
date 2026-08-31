FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY tools.json ./
COPY src ./src
# TRANSCODELY_API_KEY enables call forwarding; without it the server still
# starts and answers introspection (initialize / tools/list) over stdio.
ENTRYPOINT ["node", "src/index.mjs"]
