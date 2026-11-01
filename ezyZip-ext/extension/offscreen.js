
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let micStream = null;
let combinedStream = null;

// Listen for commands from the background service worker
chrome.runtime.onMessage.addListener((message) => {

  if (message.target !== "offscreen") return;

  if (message.type === "start-recording") {
    startRecording(message.streamId);
  }

  if (message.type === "stop-recording") {
    stopRecording();
  }
});

async function startRecording(streamId) {
  try {

    // Get the actual audio stream using Chrome's stream ID
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      }
    });
// Capture the user's microphone separately
micStream = await navigator.mediaDevices.getUserMedia({
  audio: true
});

console.log("Microphone captured:", micStream.getAudioTracks().length);
    // Keep the meeting audio audible to the user
    // Create an audio processing context
audioContext = new AudioContext();

if (audioContext.state === "suspended") {
  await audioContext.resume();
}

// Create the final combined audio output
const destination = audioContext.createMediaStreamDestination();

// Get the Meet tab audio source
const tabSource = audioContext.createMediaStreamSource(mediaStream);

// Get the microphone audio source
const micSource = audioContext.createMediaStreamSource(micStream);

// Send both sources into the combined output
tabSource.connect(destination);
micSource.connect(destination);

// Keep Meet audio audible through your speakers or earphones
tabSource.connect(audioContext.destination);

// Store the combined stream
combinedStream = destination.stream;
    recordedChunks = [];

    // Select a supported audio format
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";

     mediaRecorder = mimeType
  ? new MediaRecorder(combinedStream, { mimeType })
  : new MediaRecorder(combinedStream);
    // Save incoming audio chunks
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // When recording stops, create and upload the audio file
    mediaRecorder.onstop = async () => {

      const audioBlob = new Blob(recordedChunks, {
        type: mediaRecorder.mimeType
      });

      // Check whether recording contains data
      if (audioBlob.size === 0) {
        chrome.runtime.sendMessage({
          type: "recording-error",
          error: "Recording is empty. Please try again."
        });
      } else {

        const TEST_MEETING_ID = "test-meeting-001";

        // Package audio for backend upload
        const formData = new FormData();
        formData.append("audio", audioBlob, "meeting-recording.webm");

        try {
          const response = await fetch(
            `http://localhost:5000/api/meetings/${TEST_MEETING_ID}/audio`,
            {
              method: "POST",
              body: formData
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error?.message || "Audio upload failed."
            );
          }

          chrome.runtime.sendMessage({
            type: "upload-success",
            message: "Audio uploaded successfully!"
          });

        } catch (error) {
          chrome.runtime.sendMessage({
            type: "upload-error",
            error: error.message
          });
        }
      }

      // Release recording resources
     // Release Meet tab audio
if (mediaStream) {
  mediaStream.getTracks().forEach(track => track.stop());
}

// Release microphone audio
if (micStream) {
  micStream.getTracks().forEach(track => track.stop());
}

// Close the audio processing context
if (audioContext) {
  await audioContext.close();
}

// Clear stored streams and recorder
mediaStream = null;
micStream = null;
combinedStream = null;
mediaRecorder = null;
audioContext = null;
    };

    // Start recording
    mediaRecorder.start();

    chrome.runtime.sendMessage({
      type: "recording-started"
    });

  } catch (error) {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }

  if (audioContext) {
    await audioContext.close();
  }

  mediaStream = null;
  micStream = null;
  combinedStream = null;
  mediaRecorder = null;
  audioContext = null;

  chrome.runtime.sendMessage({
    type: "recording-error",
    error: error.message
  });
}
}

// Stop the recording when requested
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}
