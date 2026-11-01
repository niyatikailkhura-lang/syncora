
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const Meeting = require("../models/Meeting");
const TranscriptSegment = require("../models/TranscriptSegment");
const Task = require("../models/Task");
const Decision = require("../models/Decision");
const OpenQuestion = require("../models/OpenQuestion");

const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

// Create a meeting
router.post("/", async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Meeting title is required"
        }
      });
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      createdBy: req.user.userId
    });

    return res.status(201).json({
      success: true,
      data: {
        meetingId: meeting._id.toString(),
        title: meeting.title,
        status: meeting.status,
        createdAt: meeting.createdAt
      }
    });
  } catch (error) {
    console.error("Create meeting error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Failed to create meeting"
      }
    });
  }
});

// Get all meetings created by the logged-in user
router.get("/", async (req, res) => {
  try {
    const meetings = await Meeting.find({
      createdBy: req.user.userId
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: meetings
    });
  } catch (error) {
    console.error("Get meetings error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Failed to fetch meetings"
      }
    });
  }
});

// Get a meeting by ID
router.get("/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid meeting ID"
        }
      });
    }

    const meeting = await Meeting.findOne({
      _id: meetingId,
      createdBy: req.user.userId
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Meeting not found"
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: meeting
    });
  } catch (error) {
    console.error("Get meeting error:", error.message);

    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Failed to fetch meeting"
      }
    });
  }
});

// Upload meeting audio, analyze it with Python, and save results
router.post(
  "/:meetingId/audio",

  // Step 1: Validate meeting
  async (req, res, next) => {
    try {
      const { meetingId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(meetingId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_MEETING_ID",
            message: "Invalid meeting ID"
          }
        });
      }

      const meeting = await Meeting.findOne({
        _id: meetingId,
        createdBy: req.user.userId
      });

      if (!meeting) {
        return res.status(404).json({
          success: false,
          error: {
            code: "MEETING_NOT_FOUND",
            message: "Meeting not found"
          }
        });
      }

      req.meeting = meeting;
      next();
    } catch (error) {
      next(error);
    }
  },

  // Step 2: Receive audio
  (req, res, next) => {
    upload.single("audio")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            code: "AUDIO_UPLOAD_ERROR",
            message: error.message
          }
        });
      }

      next();
    });
  },

  // Step 3: Send audio to Python and save its response
  async (req, res) => {
    let transactionStarted = false;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: "AUDIO_REQUIRED",
            message: "Please upload an audio file"
          }
        });
      }

      req.meeting.audioPath = req.file.path;
      req.meeting.status = "processing";
      req.meeting.errorMessage = null;

      await req.meeting.save();

      const form = new FormData();

      form.append("audio", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      const pythonResponse = await axios.post(
        `${process.env.PYTHON_SERVICE_URL}/api/v1/analyze`,
        form,
        {
          headers: form.getHeaders(),
          timeout: 600000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      const {
        transcriptSegments = [],
        tasks = [],
        decisions = [],
        openQuestions = []
      } = pythonResponse.data;

      // Validate response structure before saving
      if (
        !Array.isArray(transcriptSegments) ||
        !Array.isArray(tasks) ||
        !Array.isArray(decisions) ||
        !Array.isArray(openQuestions)
      ) {
        throw new Error("Python service returned an invalid response structure");
      }

      // Replace any previous AI results for this meeting
      // This prevents duplicate records if audio is reprocessed.
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          transactionStarted = true;

          await Promise.all([
            TranscriptSegment.deleteMany(
              { meetingId: req.meeting._id },
              { session }
            ),
            Task.deleteMany(
              { meetingId: req.meeting._id, source: "meeting_ai" },
              { session }
            ),
            Decision.deleteMany(
              { meetingId: req.meeting._id },
              { session }
            ),
            OpenQuestion.deleteMany(
              { meetingId: req.meeting._id },
              { session }
            )
          ]);

          if (transcriptSegments.length) {
            await TranscriptSegment.insertMany(
              transcriptSegments.map((segment) => ({
                meetingId: req.meeting._id,
                segmentId: segment.segmentId,
                speakerId: segment.speakerId ?? null,
                startTime: segment.startTime,
                endTime: segment.endTime,
                text: segment.text
              })),
              { session }
            );
          }

          if (tasks.length) {
            await Task.insertMany(
              tasks.map((task) => ({
                meetingId: req.meeting._id,
                createdBy: req.meeting.createdBy,
                source: "meeting_ai",
                type: task.type,
                title: task.title,
                description: task.description ?? null,
                suggestedOwnerSpeakerId:
                  task.suggestedOwnerSpeakerId ?? null,
                suggestedDeadlineText:
                  task.suggestedDeadlineText ?? null,
                suggestedDeadlineAt:
                  task.suggestedDeadlineAt ?? null,
                evidenceSegmentIds: task.evidenceSegmentIds ?? [],
                uncertaintyFlags: task.uncertaintyFlags ?? [],
                confidence: task.confidence ?? null
              })),
              { session }
            );
          }

          if (decisions.length) {
            await Decision.insertMany(
              decisions.map((decision) => ({
                meetingId: req.meeting._id,
                title: decision.title,
                evidenceSegmentIds: decision.evidenceSegmentIds ?? [],
                confidence: decision.confidence ?? null
              })),
              { session }
            );
          }

          if (openQuestions.length) {
            await OpenQuestion.insertMany(
              openQuestions.map((item) => ({
                meetingId: req.meeting._id,
                question: item.question,
                evidenceSegmentIds: item.evidenceSegmentIds ?? [],
                confidence: item.confidence ?? null
              })),
              { session }
            );
          }

          req.meeting.status = "completed";
          req.meeting.endedAt = new Date();
          req.meeting.errorMessage = null;

          await req.meeting.save({ session });
        });
      } finally {
        await session.endSession();
      }

      return res.status(200).json({
        success: true,
        data: {
          meetingId: req.meeting._id.toString(),
          message: "Audio analyzed and results saved successfully",
          counts: {
            transcriptSegments: transcriptSegments.length,
            tasks: tasks.length,
            decisions: decisions.length,
            openQuestions: openQuestions.length
          }
        }
      });
    } catch (error) {
      console.error("Audio processing error:", error.message);

      req.meeting.status = "failed";
      req.meeting.errorMessage = error.message;
      await req.meeting.save();

      return res.status(500).json({
        success: false,
        error: {
          code: "AUDIO_PROCESSING_FAILED",
          message: "Failed to process and save audio analysis"
        }
      });
    } finally {
      // Remove uploaded temporary audio after processing
      if (req.file?.path) {
        fs.promises.unlink(req.file.path).catch((error) => {
          console.error("Audio cleanup error:", error.message);
        });
      }
    }
  }
);

module.exports = router;

