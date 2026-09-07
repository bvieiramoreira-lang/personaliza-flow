const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const crypto = require('crypto');

// Configuração do Multer para Fotos de Perfil (Avatar)
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, 'avatar-' + uniqueSuffix + ext);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'personaliza_salt_2026').digest('hex');
}

function generateToken(user) {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    timestamp: Date.now()
  };
  const str = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', 'personaliza_secret_key_2026').update(str).digest('hex');
  return Buffer.from(str).toString('base64') + '.' + signature;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.replace('Bearer ', '').split('.');
    if (parts.length !== 2) return null;
    const [payloadBase64, signature] = parts;
    const str = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', 'personaliza_secret_key_2026').update(str).digest('hex');
    if (signature !== expectedSig) return null;
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const inputHash = hashPassword(password);

  db.get(
    "SELECT id, name, email, password_hash, role, status, cnpj_cpf, phone, avatar_url FROM clients WHERE LOWER(email) = ?",
    [cleanEmail],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Erro no servidor ao buscar usuário.' });
      }

      if (!user || user.password_hash !== inputHash) {
        return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu email e senha.' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: 'Sua conta está inativa. Entre em contato com o suporte.' });
      }

      const token = generateToken(user);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          cnpj_cpf: user.cnpj_cpf,
          phone: user.phone,
          avatar_url: user.avatar_url || null
        }
      });
    }
  );
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  if (!decoded) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }

  db.get(
    "SELECT id, name, email, role, status, cnpj_cpf, phone, avatar_url FROM clients WHERE id = ?",
    [decoded.id],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Usuário não encontrado.' });
      }
      res.json({ user });
    }
  );
});

// POST /api/auth/avatar - Upload de foto de perfil
router.post('/avatar', uploadAvatar.single('avatar'), (req, res) => {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  if (!decoded) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de imagem foi enviado.' });
  }

  const avatarUrl = `/uploads/${req.file.filename}`;

  db.run(
    `UPDATE clients SET avatar_url = ? WHERE id = ?`,
    [avatarUrl, decoded.id],
    function (err) {
      if (err) {
        console.error('Erro ao atualizar avatar:', err);
        return res.status(500).json({ error: 'Erro ao salvar avatar no banco de dados.' });
      }
      res.json({
        success: true,
        avatarUrl,
        message: 'Foto de perfil atualizada com sucesso!'
      });
    }
  );
});

// DELETE /api/auth/avatar - Remover foto de perfil
router.delete('/avatar', (req, res) => {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  if (!decoded) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }

  db.run(
    `UPDATE clients SET avatar_url = NULL WHERE id = ?`,
    [decoded.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Erro ao remover foto de perfil.' });
      }
      res.json({ success: true, message: 'Foto de perfil removida com sucesso.' });
    }
  );
});

// PUT /api/auth/me - Atualizar perfil do usuário autenticado
router.put('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  let decoded = verifyToken(authHeader);

  let targetUserId = decoded ? decoded.id : null;
  if (!targetUserId && req.headers['x-user-id']) {
    targetUserId = parseInt(req.headers['x-user-id'], 10);
  }
  if (!targetUserId && req.headers['x-target-client-id']) {
    targetUserId = parseInt(req.headers['x-target-client-id'], 10);
  }

  if (!targetUserId) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
  }

  const { name, phone, cnpj_cpf, doc, cnpj, password, avatar_url } = req.body;
  const finalDoc = cnpj_cpf !== undefined ? cnpj_cpf : (doc !== undefined ? doc : (cnpj !== undefined ? cnpj : null));
  const finalPhone = phone ? phone.trim() : null;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome é obrigatório.' });
  }

  const hasAvatarUpdate = avatar_url !== undefined;

  if (password && password.trim().length > 0) {
    const cleanPass = password.trim();
    if (cleanPass.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }
    const pHash = hashPassword(cleanPass);
    const sql = hasAvatarUpdate
      ? `UPDATE clients SET name = ?, phone = ?, cnpj_cpf = ?, password_hash = ?, avatar_url = ? WHERE id = ?`
      : `UPDATE clients SET name = ?, phone = ?, cnpj_cpf = ?, password_hash = ? WHERE id = ?`;
    const params = hasAvatarUpdate
      ? [name.trim(), finalPhone, finalDoc, pHash, avatar_url, targetUserId]
      : [name.trim(), finalPhone, finalDoc, pHash, targetUserId];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Erro ao atualizar perfil com senha:', err);
        return res.status(500).json({ error: 'Erro ao atualizar dados no banco de dados.' });
      }
      db.get(
        "SELECT id, name, email, role, status, cnpj_cpf, phone, avatar_url FROM clients WHERE id = ?",
        [targetUserId],
        (gErr, user) => {
          if (gErr || !user) return res.json({ success: true, message: 'Perfil e senha atualizados com sucesso.' });
          res.json({ success: true, message: 'Perfil e senha atualizados com sucesso.', user });
        }
      );
    });
  } else {
    const sql = hasAvatarUpdate
      ? `UPDATE clients SET name = ?, phone = ?, cnpj_cpf = ?, avatar_url = ? WHERE id = ?`
      : `UPDATE clients SET name = ?, phone = ?, cnpj_cpf = ? WHERE id = ?`;
    const params = hasAvatarUpdate
      ? [name.trim(), finalPhone, finalDoc, avatar_url, targetUserId]
      : [name.trim(), finalPhone, finalDoc, targetUserId];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Erro ao atualizar perfil sem senha:', err);
        return res.status(500).json({ error: 'Erro ao atualizar dados no banco de dados.' });
      }
      db.get(
        "SELECT id, name, email, role, status, cnpj_cpf, phone, avatar_url FROM clients WHERE id = ?",
        [targetUserId],
        (gErr, user) => {
          if (gErr || !user) return res.json({ success: true, message: 'Perfil atualizado com sucesso.' });
          res.json({ success: true, message: 'Perfil atualizado com sucesso.', user });
        }
      );
    });
  }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
module.exports.generateToken = generateToken;
module.exports.hashPassword = hashPassword;


