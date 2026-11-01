
const express = require("express");
const router = express.Router();
const TaskHistory = require("../models/TaskHistory");
console.log("TASK ROUTES FILE LOADED");

const Task = require("../models/Task");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

// ==========================================
// POST /api/tasks
// Create a manual task
// ==========================================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title, description, priority, dueDate } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "TITLE_REQUIRED",
          message: "Task title is required"
        }
      });
    }

    const task = await Task.create({
      createdBy: req.user.userId,
      source: "manual",
      title: title.trim(),
      description,
      priority: priority || "medium",
      dueDate: dueDate || null
    });

    return res.status(201).json({
      success: true,
      data: { task }
    });
  } catch (error) {
    console.error("Task creation error:", error);

    return res.status(400).json({
      success: false,
      error: {
        code: "TASK_CREATION_FAILED",
        message: error.message
      }
    });
  }
});

// ==========================================
// GET /api/tasks/pending-approvals
// Manager: Get pending tasks
// ==========================================
router.get("/pending-approvals", authMiddleware, async (req, res) => {
  try {
    if (
      req.user.workspaceType !== "commercial" ||
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Only commercial managers can access pending approvals"
        }
      });
    }

    const tasks = await Task.find({
      approvalStatus: "pending"
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        count: tasks.length,
        tasks
      }
    });
  } catch (error) {
    console.error("Pending approvals error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_FETCH_FAILED",
        message: error.message
      }
    });
  }
});
// ==========================================
// GET /api/tasks/employees
// Manager: Get commercial employees
// ==========================================
router.get("/employees", authMiddleware, async (req, res) => {
  try {
    if (
      req.user.workspaceType !== "commercial" ||
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Only commercial managers can view employees"
        }
      });
    }

    const employees = await User.find({
      role: "employee",
      workspaceType: "commercial"
    }).select("_id name email");

    return res.status(200).json({
      success: true,
      data: { employees }
    });
  } catch (error) {
    console.error("Employee fetch error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "EMPLOYEE_FETCH_FAILED",
        message: error.message
      }
    });
  }
});
// ==========================================
// PATCH /api/tasks/:id/approve
// Manager: Approve and assign a task
// ==========================================
router.patch("/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (
      req.user.workspaceType !== "commercial" ||
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Only commercial managers can approve tasks"
        }
      });
    }

    const { assigneeId } = req.body;

    if (!assigneeId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "ASSIGNEE_REQUIRED",
          message: "Please provide an employee ID"
        }
      });
    }

    const employee = await User.findOne({
      _id: assigneeId,
      role: "employee",
      workspaceType: "commercial"
    });

    if (!employee) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_EMPLOYEE",
          message: "Employee not found in commercial workspace"
        }
      });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      approvalStatus: "pending"
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Pending task not found"
        }
      });
    }

    task.assigneeId = employee._id;
    task.approvalStatus = "approved";
    task.reviewedBy = req.user.userId;
    task.reviewedAt = new Date();

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task approved and assigned successfully",
      data: { task }
    });
  } catch (error) {
    console.error("Task approval error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_APPROVAL_FAILED",
        message: error.message
      }
    });
  }
});
// ==========================================
// PATCH /api/tasks/:id/reject
// Manager: Reject a pending task
// ==========================================
router.patch("/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (
      req.user.workspaceType !== "commercial" ||
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Only commercial managers can reject tasks"
        }
      });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      approvalStatus: "pending"
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Pending task not found"
        }
      });
    }

    task.approvalStatus = "rejected";
    task.reviewedBy = req.user.userId;
    task.reviewedAt = new Date();

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task rejected successfully",
      data: { task }
    });

  } catch (error) {
    console.error("Task rejection error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_REJECTION_FAILED",
        message: error.message
      }
    });
  }
});
// ==========================================
// GET /api/tasks/my-tasks
// Employee: Get assigned approved tasks
// ==========================================
router.get("/my-tasks", authMiddleware, async (req, res) => {
  try {
    if (
      req.user.workspaceType !== "commercial" ||
      req.user.role !== "employee"
    ) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Only commercial employees can access this route"
        }
      });
    }

    const tasks = await Task.find({
      assigneeId: req.user.userId,
      approvalStatus: "approved"
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        count: tasks.length,
        tasks
      }
    });
  } catch (error) {
    console.error("Assigned tasks error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_FETCH_FAILED",
        message: error.message
      }
    });
  }
});

// ==========================================
// PATCH /api/tasks/:id/status
// Employee: Update assigned task status
// Other users: Update tasks they created
// ==========================================

router.patch("/:id/status", authMiddleware, async (req, res) => {
 console.log("STATUS ROUTE REGISTERED");
    console.log("STATUS ROUTE HIT");
    try {
    const { workStatus } = req.body;

    console.log("STATUS REQUEST BODY:", req.body);
    console.log("RECEIVED WORK STATUS:", workStatus);

    const allowedStatuses = [
      "not_started",
      "in_progress",
      "blocked",
      "completed"
    ];

    if (!allowedStatuses.includes(workStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_STATUS",
          message: "Invalid task status"
        }
      });
    }

    let taskFilter;

    if (
      req.user.workspaceType === "commercial" &&
      req.user.role === "employee"
    ) {
      taskFilter = {
        _id: req.params.id,
        assigneeId: req.user.userId,
        approvalStatus: "approved"
      };
    } else {
      taskFilter = {
        _id: req.params.id,
        createdBy: req.user.userId
      };
    }

    const task = await Task.findOne(taskFilter);

if (!task) {
  return res.status(404).json({
    success: false,
    error: {
      code: "TASK_NOT_FOUND",
      message: "Task not found or you are not allowed to update it"
    }
  });
}

const previousStatus = task.workStatus;
if (previousStatus === workStatus) {
  return res.status(200).json({
    success: true,
    message: "Task is already in this status",
    data: { task }
  });
}
// Update task
task.workStatus = workStatus;
await task.save();

// Record status history
await TaskHistory.create({
  taskId: task._id,
  changedBy: req.user.userId,
  action: "status_updated",
  previousValue: previousStatus,
  newValue: workStatus
});

    return res.status(200).json({
      success: true,
      message: "Task status updated successfully",
      data: { task }
    });
  } catch (error) {
    console.error("Task status update error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_UPDATE_FAILED",
        message: error.message
      }
    });
  }
});

// ==========================================
// GET /api/tasks
// Get tasks created by logged-in user
// ==========================================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({
      createdBy: req.user.userId
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        count: tasks.length,
        tasks
      }
    });
  } catch (error) {
    console.error("Task fetch error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_FETCH_FAILED",
        message: error.message
      }
    });
  }
});

// ==========================================
// DELETE /api/tasks/:id
// Delete a task created by logged-in user
// ==========================================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.userId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found"
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      data: { task }
    });
  } catch (error) {
    console.error("Task deletion error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "TASK_DELETE_FAILED",
        message: error.message
      }
    });
  }
});
// Get task history
router.get("/:id/history", authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found"
        }
      });
    }

    // Only the task creator or assigned employee can view history
    const isCreator =
      task.createdBy.toString() === req.user.userId;

    const isAssignee =
      task.assigneeId &&
      task.assigneeId.toString() === req.user.userId;

    if (!isCreator && !isAssignee) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You are not allowed to view this task history"
        }
      });
    }

    const history = await TaskHistory.find({
      taskId: task._id
    })
      .populate("changedBy", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: { history }
    });

  } catch (error) {
    console.error("Task history fetch error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "HISTORY_FETCH_FAILED",
        message: error.message
      }
    });
  }
});
module.exports = router;
