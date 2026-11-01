const mongoose = require("mongoose");

const openQuestionSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true
    },

    question: {
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

module.exports = mongoose.model("OpenQuestion", openQuestionSchema);