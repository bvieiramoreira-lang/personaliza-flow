# Plano de Implementação: Arquitetura Multi-Tenant & Gestão de Clientes - Persys (PersonalizaFlow)

## 🎯 Objetivo
Implementar uma estrutura **Multi-Tenant (SaaS)** profissional com gestão individualizada por cliente:
1. **Login & Autenticação**: Tela de login unificada para Clientes e Administradores com credenciais (Email e Senha).
2. **Aba "Clientes" no Painel Admin**:
   - Listagem completa de todos os clientes cadastrados.
   - Botão **"+ Adicionar Cliente"** para criação de novas contas (Nome, Email, Senha, CNPJ/CPF, Contato).
   - Ao clicar em um cliente (ex: Cresol), abre a visão dedicada contendo:
     - **Produtos**: Catálogo de produtos vinculados àquele cliente (com opção do Admin adicionar novos produtos diretamente para ele).
     - **Carteira / Faturamento**: Saldo em aberto, total quitado e faturas do cliente.
     - **Dados Cadastrais**: Informações da empresa e gerenciamento de acesso.
3. **Isolamento Completo de Clientes**:
   - Cada cliente logado acessa **apenas** seus produtos, seus pedidos/remessas e sua carteira financeira.
4. **Limpeza Inicial de Dados**:
   - Reset do banco de dados para iniciar com estrutura limpa e pronta para testes com o novo fluxo de clientes.

---

## 🏗️ 1. Banco de Dados & Estrutura Schema

### 1.1 Tabela `clients`
```sql
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                  -- Ex: "Cresol", "Empresa B"
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  cnpj_cpf TEXT,
  phone TEXT,
  role TEXT DEFAULT 'client',          -- 'admin' ou 'client'
  status TEXT DEFAULT 'active',        -- 'active' ou 'inactive'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 1.2 Associação por `client_id`
Adicionar a coluna `client_id INTEGER REFERENCES clients(id)` em:
- `products`
- `shipments`
- `cart_items`
- `addresses`
- `billing_invoices`

---

## 🚀 2. Fases de Execução

### **Fase 1: Banco de Dados & Endpoints da API**
- [x] Atualizar `database.js` com a tabela `clients` e migração do `client_id` em todas as tabelas.
- [ ] Criar arquivo `server/routes/auth.js` com rotas `/api/auth/login`, `/api/auth/me` e `/api/auth/logout`.
- [ ] Criar arquivo `server/routes/clients.js` para CRUD de clientes (`GET /api/clients`, `POST /api/clients`, `GET /api/clients/:id`, `PUT /api/clients/:id`).
- [ ] Atualizar rotas existentes (`products.js`, `shipments.js`, `billing.js`, `addresses.js`, `cart.js`) para filtrar por `client_id`.

### **Fase 2: Tela de Login (`/login.html`) & Proteção de Sessão**
- [ ] Criar a interface visual de Login moderna e responsiva.
- [ ] Integrar autenticação no frontend (`localStorage` + token de acesso).

### **Fase 3: Aba "Clientes" no Painel Admin**
- [ ] Adicionar item de menu **"Clientes"** na sidebar para administradores.
- [ ] Criar a visão de listagem de clientes com busca e métricas rápidas.
- [ ] Criar o modal **"+ Adicionar Cliente"**.
- [ ] Criar a página/modal de **Detalhes do Cliente** (com sub-abas: *Produtos*, *Carteira*, *Dados Cadastrais*).

### **Fase 4: Teste de Navegação & Verificação E2E**
- [ ] Limpeza da base legada e criação do primeiro Administrador e primeiro Cliente de teste.
- [ ] Validação visual do login, isolamento de dados e gestão de produtos/carteira pelo Admin.
