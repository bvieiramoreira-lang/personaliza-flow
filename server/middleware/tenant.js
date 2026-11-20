const { verifyToken } = require('../routes/auth');
const db = require('../database');

function tenantMiddleware(req, res, next) {
  const reqPath = req.path || '';
  const isApiRoute = reqPath.startsWith('/api');

  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);
  req.user = decoded;

  // Rotas públicas/externas que possuem autenticação própria (Login e API Externa v1 via X-API-Key)
  const isPublicAuthRoute =
    reqPath === '/api/auth/login' ||
    reqPath.startsWith('/api/integrations/v1');

  if (isApiRoute && !isPublicAuthRoute && (!decoded || !decoded.id)) {
    return res.status(401).json({
      error: 'Acesso não autorizado. Faça login na plataforma para continuar.'
    });
  }

  if (decoded && decoded.role === 'client') {
    req.isClient = true;
    req.isAdmin = false;
    req.clientId = Number(decoded.id);
    db.get('SELECT parent_client_id, status FROM clients WHERE id = ?', [decoded.id], (err, row) => {
      if (row && row.status === 'inactive') {
        return res.status(403).json({ error: 'Sua conta foi desativada.' });
      }
      req.parentClientId = (row && row.parent_client_id)
        ? Number(row.parent_client_id)
        : (decoded.parent_client_id ? Number(decoded.parent_client_id) : null);
      req.rootClientId = req.parentClientId || req.clientId;
      next();
    });
  } else if (decoded && decoded.role === 'admin') {
    req.isClient = false;
    req.isAdmin = true;
    const target = req.query.client_id || req.headers['x-target-client-id'];
    req.clientId = target ? parseInt(target, 10) : null;
    req.parentClientId = null;
    req.rootClientId = req.clientId;
    next();
  } else {
    req.clientId = null;
    req.parentClientId = null;
    req.rootClientId = null;
    req.isClient = false;
    req.isAdmin = false;
    next();
  }
}

module.exports = tenantMiddleware;
