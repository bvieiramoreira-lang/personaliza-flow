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
});

module.exports = db;
