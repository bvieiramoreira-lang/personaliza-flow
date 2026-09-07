const { verifyToken } = require('../routes/auth');

function tenantMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const decoded = verifyToken(authHeader);

  req.user = decoded;

  if (decoded && decoded.role === 'client') {
    req.isClient = true;
    req.isAdmin = false;
    req.clientId = decoded.id;
  } else if (decoded && decoded.role === 'admin') {
    req.isClient = false;
    req.isAdmin = true;
    const target = req.query.client_id || req.headers['x-target-client-id'];
    req.clientId = target ? parseInt(target, 10) : null;
  } else {
    const target = req.query.client_id || req.headers['x-target-client-id'];
    req.clientId = target ? parseInt(target, 10) : null;
    req.isClient = false;
    req.isAdmin = false;
  }

  next();
}

module.exports = tenantMiddleware;