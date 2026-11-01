function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Please log in first"
        }
      });
    }
  const workspaceRoleMap = {
      student: ["student"],
      event: ["organiser", "team_member"],
      commercial: ["manager", "employee"],
      developers: ["developer", "stakeholder"]
    };
      const validRoles = workspaceRoleMap[req.user.workspaceType];

    if (!validRoles || !validRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "INVALID_WORKSPACE_ROLE",
          message: "Invalid role for this workspace"
        }
      });
    }

    // Check whether user's role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to access this resource"
        }
      });
    }

    next();
  };
}

module.exports = authorizeRoles;