const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Không có token, truy cập bị từ chối' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

const authorize = (allowedRoles) => (req, res, next) => {
    console.log('Authorizing user with role:', req.user.roleName);
    console.log('Allowed roles for this route:', allowedRoles.join(', '));

    if (!allowedRoles.includes(req.user.roleName)) {
        console.log('Access denied: User role not authorized.');
        return res.status(403).json({ message: "Access denied" });
    }

    console.log('User authorized, proceeding to the next middleware.');
    next();
};

module.exports = { authenticate, authorize };
