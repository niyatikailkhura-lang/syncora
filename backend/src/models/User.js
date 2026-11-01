const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true
    },

    workspaceType: {
      type: String,
      enum: ["student", "event", "commercial", "developers"],
      required: true
    },

    role: {
      type: String,
      enum: [
        "student",
        "organiser",
        "team_member",
        "manager",
        "employee",
        "developer",
        "stakeholder"
      ],
      required: true
    }
  },
  { timestamps: true }
);
userSchema.pre("validate", function () {
  const validRoles = {
    student: ["student"],
    event: ["organiser", "team_member"],
    commercial: ["manager", "employee"],
    developers: ["developer", "stakeholder"]
  };

  if (!validRoles[this.workspaceType]?.includes(this.role)) {
    this.invalidate(
      "role",
      `${this.role} is not a valid role for ${this.workspaceType} workspace`
    );
  }
});
module.exports = mongoose.model("User", userSchema);