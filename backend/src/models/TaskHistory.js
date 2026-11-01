const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
const TaskHistory = require("../models/TaskHistory");
const taskHistorySchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    action: {
      type: String,
      required: true
    },

    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("TaskHistory", taskHistorySchema);