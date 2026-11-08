const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'personaliza_flow.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Ativar FK
  db.run("PRAGMA foreign_keys = ON;");

  // Tabela de Clientes e Usuários da Plataforma
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      cnpj_cpf TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'client',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Produtos
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      stock_qty INTEGER DEFAULT 100,
      unit_weight REAL DEFAULT 0,
      unit_height REAL DEFAULT 0,
      unit_width REAL DEFAULT 0,
      unit_length REAL DEFAULT 0,
      unit_measure TEXT DEFAULT 'un',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // Migration de segurança se stock_qty ainda não existir
  db.run("ALTER TABLE products ADD COLUMN stock_qty INTEGER DEFAULT 100", (err) => {
    if (!err) {
      db.run("UPDATE products SET stock_qty = 100 WHERE stock_qty IS NULL;");
    }
  });

  // Migration de segurança para order_number e client_id
  db.run("ALTER TABLE products ADD COLUMN order_number TEXT", () => {});
  db.run("ALTER TABLE products ADD COLUMN client_id INTEGER REFERENCES clients(id)", () => {});
  db.run("ALTER TABLE clients ADD COLUMN avatar_url TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN parent_client_id INTEGER REFERENCES clients(id)", () => {});
  db.run("ALTER TABLE clients ADD COLUMN branch_number TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN can_access_flow INTEGER DEFAULT 1", () => {});
  db.run("ALTER TABLE clients ADD COLUMN can_access_store INTEGER DEFAULT 1", () => {});
  db.run("ALTER TABLE clients ADD COLUMN cep TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN address TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN address_number TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN complement TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN neighborhood TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN city TEXT", () => {});
  db.run("ALTER TABLE clients ADD COLUMN state TEXT", () => {});

  // Tabela de Regras de Embalagem (por produto)
  db.run(`
    CREATE TABLE IF NOT EXISTS packaging_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER UNIQUE NOT NULL,
      max_qty_per_box INTEGER NOT NULL DEFAULT 1,
      box_weight REAL DEFAULT 0.2,
      box_height REAL NOT NULL DEFAULT 10,
      box_width REAL NOT NULL DEFAULT 10,
      box_length REAL NOT NULL DEFAULT 10,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Tabela de Rascunho / Carrinho de Envio
  db.run(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      session_id TEXT NOT NULL DEFAULT 'default_session',
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);
  db.run("ALTER TABLE cart_items ADD COLUMN client_id INTEGER REFERENCES clients(id)", () => {});

  // Tabela de Solicitações de Envio (Remessas)
  db.run(`
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'coletivo',
      recipient_name TEXT,
      dest_cep TEXT NOT NULL,
      dest_address TEXT,
      dest_city TEXT,
      dest_state TEXT,
      dest_number TEXT,
      dest_complement TEXT,
      total_weight REAL DEFAULT 0,
      total_volumes INTEGER DEFAULT 0,
      selected_carrier TEXT,
      selected_service TEXT,
      quoted_freight_cost REAL DEFAULT 0,
      markup_percent REAL DEFAULT 10.0,
      final_freight_price REAL DEFAULT 0,
      delivery_days INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      is_manual_override INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);
  db.run("ALTER TABLE shipments ADD COLUMN client_id INTEGER REFERENCES clients(id)", () => {});

  // Tabela de Itens da Remessa
  db.run(`
    CREATE TABLE IF NOT EXISTS shipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Tabela de Embalagens / Volumes Físicos Gerados para a Remessa
  db.run(`
    CREATE TABLE IF NOT EXISTS shipment_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      volume_number INTEGER NOT NULL,
      product_id INTEGER,
      weight REAL NOT NULL,
      height REAL NOT NULL,
      width REAL NOT NULL,
      length REAL NOT NULL,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
    )
  `);

  // Tabela de Endereços Pré-cadastrados (Meus Endereços)
  db.run(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      title TEXT NOT NULL,
      recipient_name TEXT,
      cep TEXT NOT NULL,
      address TEXT,
      number TEXT,
      complement TEXT,
      neighborhood TEXT,
      city TEXT,
      state TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);
  db.run("ALTER TABLE addresses ADD COLUMN client_id INTEGER REFERENCES clients(id)", () => {});

  // Tabela de Configurações do Sistema
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Inserir configurações padrão se não existirem
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('origin_cep', '80000000')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('default_markup_percent', '10.0')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('freight_provider', 'melhor_envio')`);

  // Tabela de Fechamentos / Faturas Quinzenais
  db.run(`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      code TEXT UNIQUE NOT NULL,
      period_label TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      shipments_qty INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'em_aberto',
      due_date TEXT,
      paid_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);
  db.run("ALTER TABLE billing_invoices ADD COLUMN client_id INTEGER REFERENCES clients(id)", () => {});

  // Migrações dinâmicas de colunas
  db.run(`ALTER TABLE shipments ADD COLUMN tracking_code TEXT`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN payment_status TEXT DEFAULT 'em_aberto'`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN billing_id INTEGER`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN nf_url TEXT`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN nf_number TEXT`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN boleto_url TEXT`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN billed_at DATETIME`, () => {});

  // =========================================================================
  // MÓDULO LOJA VIRTUAL B2B (ENCOMENDAS & PRODUÇÃO)
  // =========================================================================

  // 1. Configuração da Loja por Cliente
  db.run(`
    CREATE TABLE IF NOT EXISTS store_settings_client (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER UNIQUE NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      store_title TEXT,
      welcome_message TEXT,
      payment_methods_json TEXT DEFAULT '["30 DIAS BOLETO"]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);
  db.run(`ALTER TABLE store_settings_client ADD COLUMN payment_methods_json TEXT DEFAULT '["30 DIAS BOLETO"]'`, () => {});

  // 2. Produtos da Loja Virtual (Catálogo com Faixas 20/50/100/200/500/1000)
  db.run(`
    CREATE TABLE IF NOT EXISTS store_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      images_json TEXT DEFAULT '[]',
      price_20 REAL DEFAULT 0,
      price_50 REAL DEFAULT 0,
      price_100 REAL DEFAULT 0,
      price_200 REAL DEFAULT 0,
      price_500 REAL DEFAULT 0,
      price_1000 REAL DEFAULT 0,
      unit_weight REAL DEFAULT 0.3,
      unit_height REAL DEFAULT 15,
      unit_width REAL DEFAULT 10,
      unit_length REAL DEFAULT 10,
      max_qty_per_box INTEGER DEFAULT 20,
      box_weight REAL DEFAULT 0.5,
      box_height REAL DEFAULT 30,
      box_width REAL DEFAULT 40,
      box_length REAL DEFAULT 40,
      production_days INTEGER DEFAULT 7,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);
  db.run(`ALTER TABLE store_products ADD COLUMN production_days INTEGER DEFAULT 7`, () => {});

  // 3. Carrinho de Compras da Loja Virtual
  db.run(`
    CREATE TABLE IF NOT EXISTS store_cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      store_product_id INTEGER NOT NULL,
      tier_qty INTEGER NOT NULL DEFAULT 20,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (store_product_id) REFERENCES store_products(id) ON DELETE CASCADE
    )
  `);

  // 4. Pedidos da Loja Virtual (Encomendas para Produção)
  db.run(`
    CREATE TABLE IF NOT EXISTS store_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL,
      delivery_type TEXT NOT NULL DEFAULT 'flow',
      recipient_name TEXT,
      dest_cep TEXT,
      dest_address TEXT,
      dest_number TEXT,
      dest_complement TEXT,
      dest_neighborhood TEXT,
      dest_city TEXT,
      dest_state TEXT,
      selected_carrier TEXT,
      selected_service TEXT,
      freight_price REAL DEFAULT 0,
      delivery_days INTEGER DEFAULT 0,
      production_days INTEGER DEFAULT 7,
      estimated_ready_date TEXT,
      payment_method TEXT DEFAULT '30 DIAS BOLETO',
      payment_status TEXT DEFAULT 'em_aberto',
      subtotal_products REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'aguardando_producao',
      tracking_code TEXT,
      notes TEXT,
      synced_to_flow INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);
  db.run(`ALTER TABLE store_orders ADD COLUMN production_days INTEGER DEFAULT 7`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN estimated_ready_date TEXT`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN payment_method TEXT DEFAULT '30 DIAS BOLETO'`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN payment_status TEXT DEFAULT 'em_aberto'`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN nf_url TEXT`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN nf_number TEXT`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN boleto_url TEXT`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN billed_at DATETIME`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN parent_client_id INTEGER`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN billing_client_id INTEGER`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN billing_cnpj TEXT`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN billing_name TEXT`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN mother_approval_status TEXT DEFAULT 'approved'`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN mother_approved_at DATETIME`, () => {});
  db.run(`ALTER TABLE store_orders ADD COLUMN mother_rejection_reason TEXT`, () => {});

  db.run(`ALTER TABLE shipments ADD COLUMN parent_client_id INTEGER`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN billing_client_id INTEGER`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN billing_cnpj TEXT`, () => {});
  db.run(`ALTER TABLE shipments ADD COLUMN billing_name TEXT`, () => {});

  // 5. Itens do Pedido da Loja Virtual
  db.run(`
    CREATE TABLE IF NOT EXISTS store_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_order_id INTEGER NOT NULL,
      store_product_id INTEGER,
      product_code TEXT,
      product_name TEXT,
      product_image TEXT,
      tier_qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      production_days INTEGER DEFAULT 7,
      FOREIGN KEY (store_order_id) REFERENCES store_orders(id) ON DELETE CASCADE
    )
  `);
  db.run(`ALTER TABLE store_order_items ADD COLUMN production_days INTEGER DEFAULT 7`, () => {});
});

module.exports = db;
