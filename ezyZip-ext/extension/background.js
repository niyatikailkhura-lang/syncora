
// Listen for messages from other extension pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Request Google Meet audio access
  if (message.type === "request-meet-stream") {
    getMeetAudioStream(message.meetTabId, sender.tab?.id)
      .then((streamId) => {
        sendResponse({
          success: true,
          streamId: streamId
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  // Request the TeamOS login token
  if (message.type === "get-auth-token") {
    getAuthToken()
      .then((token) => {
        sendResponse({
          success: true,
          token: token
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }
});


// Create a stream ID for the specified Meet tab
async function getMeetAudioStream(meetTabId, recorderTabId) {

  if (!meetTabId || !recorderTabId) {
    throw new Error("Meet tab or recorder tab ID is missing.");
  }

  const meetTab = await chrome.tabs.get(meetTabId);

  if (!meetTab.url || !meetTab.url.startsWith("https://meet.google.com/")) {
    throw new Error("The selected tab is not a Google Meet tab.");
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: meetTabId,
    consumerTabId: recorderTabId
  });

  return streamId;
}


// Retrieve the login token from the TeamOS frontend
async function getAuthToken() {

  // Find the open TeamOS tab
  const tabs = await chrome.tabs.query({
    url: "http://localhost:3001/*"
  });

  const appTab = tabs.find(tab => tab.id !== undefined);

  if (!appTab) {
    throw new Error("Please open TeamOS at localhost:3001 and log in first.");
  }

  // Read the token from TeamOS localStorage
  const results = await chrome.scripting.executeScript({
    target: {
      tabId: appTab.id
    },
    func: () => localStorage.getItem("syncora_token")
  });

  const token = results?.[0]?.result;

  if (!token) {
    throw new Error("TeamOS login token not found. Please log in again.");
  }

  return token;
}
