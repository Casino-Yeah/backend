FROM node:22-alpine
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
