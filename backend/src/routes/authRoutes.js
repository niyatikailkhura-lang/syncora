
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const router = express.Router();

// LOGIN API
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_CREDENTIALS",
          message: "Email and password are required"
        }
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim()
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

  const token = jwt.sign(
  {
    userId: user._id.toString(),
    role: user.role,
    workspaceType: user.workspaceType
  },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);
    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  workspaceType: user.workspaceType
}
      }
    });

  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "LOGIN_FAILED",
        message: "Unable to log in"
      }
    });
  }
});


// GET CURRENT LOGGED-IN USER
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error("Fetch user error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Failed to fetch user details"
      }
    });
  }
});
// MANAGER-ONLY TEST API
router.get(
  "/manager-test",
  authMiddleware,
  authorizeRoles("manager"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Manager access granted!",
      data: {
        userId: req.user.userId,
        role: req.user.role,
        workspaceType: req.user.workspaceType
      }
    });
  }
);

module.exports = router;
