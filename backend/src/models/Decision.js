const mongoose = require("mongoose");

const decisionSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    evidenceSegmentIds: {
      type: [String],
      default: []
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Decision", decisionSchema);