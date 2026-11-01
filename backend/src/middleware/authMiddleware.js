const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  try {
    // 1. Get token from request header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No token provided"
        }
      });
    }

    // 2. Extract token
    const token = authHeader.split(" ")[1];

    // 3. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Attach user information to request
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      workspaceType: decoded.workspaceType
    };

    // 5. Allow request to continue
    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired token"
      }
    });
  }
}

module.exports = authMiddleware;
