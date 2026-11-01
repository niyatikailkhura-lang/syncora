const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    meetingId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Meeting",
  default: null
},
createdBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true
},
source: {
  type: String,
  enum: ["manual", "meeting_ai"],
  default: "manual"
},

    type: {
  type: String,
  enum: ["confirmed_commitment", "proposal", "follow_up"],
  default: null
},

    title: {
      type: String,
      required: true,
      trim: true
    },
priority: {
  type: String,
  enum: ["low", "medium", "high"],
  default: "medium"
},
dueDate: {
  type: Date,
  default: null
},
    description: {
      type: String,
      default: null
    },

    suggestedOwnerSpeakerId: {
      type: String,
      default: null
    },

    suggestedDeadlineText: {
      type: String,
      default: null
    },

    suggestedDeadlineAt: {
      type: Date,
      default: null
    },

    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    approvedDeadlineAt: {
      type: Date,
      default: null
    },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },

    workStatus: {
      type: String,
      enum: ["not_started", "in_progress", "blocked", "completed"],
      default: "not_started"
    },

    evidenceSegmentIds: {
      type: [String],
      default: []
    },

    uncertaintyFlags: {
      type: [String],
      enum: [
        "owner_unclear",
        "deadline_ambiguous",
        "commitment_uncertain"
      ],
      default: []
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);
taskSchema.pre("validate", function () {
  if (this.source === "meeting_ai" && !this.type) {
    this.invalidate("type", "Type is required for AI-generated tasks");
  }
});
module.exports = mongoose.model("Task", taskSchema);