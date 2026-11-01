
let meetStream = null;
let micStream = null;
let combinedStream = null;
let mediaRecorder = null;
let audioContext = null;
let recordedChunks = [];

let meetingId = null;
let authToken = null;
let isRecording = false;

const enableMicBtn = document.getElementById("enableMicBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusText = document.getElementById("status");

// Get the original Google Meet tab ID from the page URL
const urlParams = new URLSearchParams(window.location.search);
const meetTabId = Number(urlParams.get("tabId"));


// Get TeamOS login token from background.js
async function getAuthToken() {
  const response = await chrome.runtime.sendMessage({
    type: "get-auth-token"
  });

  if (!response || !response.success || !response.token) {
    throw new Error(response?.error || "Could not get TeamOS login token.");
  }

  return response.token;
}


// Automatically create a meeting in the backend
async function createMeeting(token) {
  const title = "Google Meet - " + new Date().toLocaleString();

  const response = await fetch("http://localhost:5000/api/meetings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ title })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message ||
      result.message ||
      "Could not create meeting."
    );
  }

  const newMeetingId =
    result.data?.meetingId ||
    result.meetingId;

  if (!newMeetingId) {
    throw new Error("Backend did not return a meeting ID.");
  }

  return newMeetingId;
}


// Enable the user's microphone
enableMicBtn.addEventListener("click", async () => {
  try {
    statusText.textContent = "Requesting microphone permission...";

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    statusText.textContent = "Microphone enabled. You can start recording.";

    enableMicBtn.disabled = true;
    startBtn.disabled = false;

  } catch (error) {
    showError("Microphone error: " + error.message);
  }
});


// Start recording
startBtn.addEventListener("click", async () => {
  try {
    if (!meetTabId || Number.isNaN(meetTabId)) {
      throw new Error("Google Meet tab ID is missing. Reopen the recorder from Meet.");
    }

    if (!micStream) {
      throw new Error("Please enable your microphone first.");
    }

    startBtn.disabled = true;
    statusText.textContent = "Connecting to TeamOS...";

    // Get the logged-in user's token
    authToken = await getAuthToken();

    // Create a meeting automatically
    statusText.textContent = "Creating meeting...";
    meetingId = await createMeeting(authToken);

    statusText.textContent = "Connecting to Google Meet audio...";

    // Ask background.js to create a Meet audio stream ID
    const streamResponse = await chrome.runtime.sendMessage({
      type: "request-meet-stream",
      meetTabId: meetTabId
    });

    if (!streamResponse || !streamResponse.success) {
      throw new Error(
        streamResponse?.error || "Could not connect to Meet audio."
      );
    }

    // Capture Google Meet audio
    meetStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamResponse.streamId
        }
      }
    });

    // Combine Meet audio and microphone audio
    audioContext = new AudioContext();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const destination = audioContext.createMediaStreamDestination();

    const meetSource =
      audioContext.createMediaStreamSource(meetStream);

    const micSource =
      audioContext.createMediaStreamSource(micStream);

    meetSource.connect(destination);
    micSource.connect(destination);

    // Keep Meet audio audible through speakers or earphones
    meetSource.connect(audioContext.destination);

    combinedStream = destination.stream;
    recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported(
      "audio/webm;codecs=opus"
    )
      ? "audio/webm;codecs=opus"
      : "";

    mediaRecorder = mimeType
      ? new MediaRecorder(combinedStream, { mimeType })
      : new MediaRecorder(combinedStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = uploadRecording;

    mediaRecorder.start();

    isRecording = true;

    startBtn.disabled = true;
    stopBtn.disabled = false;

    statusText.textContent = "Status: Recording...";

  } catch (error) {
    showError(error.message);

    // If meeting creation succeeded but recording setup failed,
    // the meeting will remain in the backend with status "created".
    meetingId = null;
    authToken = null;

    if (meetStream) {
      meetStream.getTracks().forEach(track => track.stop());
      meetStream = null;
    }

    if (audioContext && audioContext.state !== "closed") {
      await audioContext.close();
      audioContext = null;
    }

    startBtn.disabled = false;
  }
});


// Stop recording
stopBtn.addEventListener("click", stopRecording);

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopBtn.disabled = true;
    statusText.textContent = "Processing recording...";
    mediaRecorder.stop();
  }
}


// Upload the completed recording
async function uploadRecording() {
  try {
    if (!meetingId || !authToken) {
      throw new Error("Meeting ID or login token is missing.");
    }

    const audioBlob = new Blob(recordedChunks, {
      type: mediaRecorder.mimeType || "audio/webm"
    });

    if (audioBlob.size === 0) {
      throw new Error("Recording is empty.");
    }

    statusText.textContent = "Uploading audio to TeamOS...";

    const formData = new FormData();

    formData.append(
      "audio",
      audioBlob,
      "meeting-recording.webm"
    );

    const response = await fetch(
      `http://localhost:5000/api/meetings/${meetingId}/audio`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`
        },
        body: formData
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message ||
        result.message ||
        "Audio upload failed."
      );
    }

    statusText.textContent =
      "Audio uploaded successfully! Meeting analysis is complete.";

  } catch (error) {
    showError("Upload error: " + error.message);

  } finally {
    await cleanup();
  }
}


// Release audio resources
async function cleanup() {
  if (meetStream) {
    meetStream.getTracks().forEach(track => track.stop());
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }

  if (combinedStream) {
    combinedStream.getTracks().forEach(track => track.stop());
  }

  if (audioContext && audioContext.state !== "closed") {
    await audioContext.close();
  }

  meetStream = null;
  micStream = null;
  combinedStream = null;
  mediaRecorder = null;
  audioContext = null;

  recordedChunks = [];
  meetingId = null;
  authToken = null;
  isRecording = false;

  startBtn.disabled = true;
  stopBtn.disabled = true;
  enableMicBtn.disabled = false;
}


function showError(message) {
  statusText.textContent = "Error: " + message;
}
