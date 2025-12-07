function authorizeRole(allowedRoles = []) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: "Chưa xác thực người dùng." });
      }
  
      const userRole = req.user.VaiTro;
  
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
  
      next();
    };
  }
  
  module.exports = authorizeRole;