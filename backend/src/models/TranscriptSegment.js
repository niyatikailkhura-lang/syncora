const mongoose = require("mongoose");

const transcriptSegmentSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true
    },
    segmentId: {
      type: String,
      required: true
    },
    speakerId: {
      type: String,
      default: null
    },
    startTime: {
      type: Number,
      required: true
    },
    endTime: {
      type: Number,
      required: true
    },
    text: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

transcriptSegmentSchema.index(
  { meetingId: 1, segmentId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "TranscriptSegment",
  transcriptSegmentSchema
);