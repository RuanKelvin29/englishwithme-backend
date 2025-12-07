const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Không có token được cung cấp.' });
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ error: 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại' });
      } else {
        return res.status(403).json({ error: 'Token không hợp lệ.' });
      }
    }

    req.user = user;
    next();
  });
}

module.exports = authenticateToken;