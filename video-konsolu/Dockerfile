FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY public ./public
ENV HOST=0.0.0.0
ENV PORT=8080
USER pwuser
CMD ["node", "server.mjs"]
