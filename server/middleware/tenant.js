const { verifyToken } = require('../routes/auth');
const db = require('../database');

function tenantMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  req.user = decoded;

  if (decoded && decoded.role === 'client') {
    req.isClient = true;
    req.isAdmin = false;
    req.clientId = decoded.id;
    db.get('SELECT parent_client_id FROM clients WHERE id = ?', [decoded.id], (err, row) => {
      req.parentClientId = (row && row.parent_client_id) ? Number(row.parent_client_id) : (decoded.parent_client_id ? Number(decoded.parent_client_id) : null);
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
    const target = req.query.client_id || req.headers['x-target-client-id'];
    req.clientId = target ? parseInt(target, 10) : null;
    req.parentClientId = null;
    req.rootClientId = req.clientId;
    req.isClient = false;
    req.isAdmin = false;
    next();
  }
}

module.exports = tenantMiddleware;