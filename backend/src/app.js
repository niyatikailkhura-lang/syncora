console.log("LOADED THE CORRECT APP.JS");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/authRoutes");
const meetingRoutes = require("./routes/meetingRoutes");
const taskRoutes = require("./routes/taskRoutes");

const authMiddleware = require("./middleware/authMiddleware");
const roleMiddleware = require("./middleware/roleMiddleware");

const app = express();

// Log every incoming request
app.use((req, res, next) => {
  console.log("INCOMING REQUEST:", req.method, req.originalUrl);
  next();
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get(
  "/api/test-manager",
  authMiddleware,
  roleMiddleware("manager"),
  (req, res) => {
    res.json({
      success: true,
      message: "Manager access granted!"
    });
  }
);

app.get("/api/test-protected", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "You are authenticated!",
    user: req.user
  });
});

app.use("/api/tasks", taskRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: "TeamOS backend is running"
    }
  });
});

module.exports = app;