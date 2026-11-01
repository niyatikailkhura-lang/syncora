
function roleMiddleware(...allowedRoles) {
  return (req, res, next) => {
    // Check whether user has an allowed role
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action"
        }
      });
    }

    next();
  };
}

module.exports = roleMiddleware;
