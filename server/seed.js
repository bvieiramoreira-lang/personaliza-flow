const db = require('./database');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'personaliza_salt_2026').digest('hex');
}

function seedDatabase() {
  db.get("SELECT COUNT(*) as count FROM clients WHERE role = 'admin'", (err, row) => {
    if (err) return console.error('Erro ao checar admin:', err.message);

    if (!row || row.count === 0) {
      console.log('🌱 Criando Administrador Padrão...');
      const adminPassHash = hashPassword('admin123');

      db.run(
        `INSERT INTO clients (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)`,
        ['Administrador Flow', 'admin@personalizaflow.com', adminPassHash, 'admin', 'active'],
        function (aErr) {
          if (aErr) return console.error('Erro ao criar admin:', aErr.message);
          console.log('✅ Administrador criado: admin@personalizaflow.com / admin123');
        }
      );
    }
  });
}

module.exports = { seedDatabase, hashPassword };
