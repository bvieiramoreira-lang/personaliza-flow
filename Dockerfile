FROM node:20-alpine

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install --production

# Copiar arquivos do projeto
COPY . .

# Criar diretórios de persistência se não existirem
RUN mkdir -p data uploads

EXPOSE 3005

ENV PORT=3005
ENV NODE_ENV=production

CMD ["node", "server/server.js"]
