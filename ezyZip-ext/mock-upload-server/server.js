
const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();
const PORT = 5000;

// Allow requests from the Chrome extension
app.use(cors());

// Configure uploaded file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Receive meeting audio
app.post(
  "/api/meetings/:meetingId/audio",
  upload.single("audio"),
  (req, res) => {

    console.log("Meeting ID:", req.params.meetingId);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          message: "No audio file received."
        }
      });
    }

    console.log("Audio received successfully!");
    console.log("File name:", req.file.originalname);
    console.log("File size:", req.file.size, "bytes");
    console.log("File type:", req.file.mimetype);
    console.log("Saved at:", req.file.path);

    return res.status(200).json({
      success: true,
      data: {
        message: "Audio received successfully!",
        filename: req.file.originalname,
        size: req.file.size
      }
    });
  }
);

app.listen(PORT, () => {
  console.log(`Test upload server running at http://localhost:${PORT}`);
});
