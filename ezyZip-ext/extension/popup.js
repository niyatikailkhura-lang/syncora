
const openRecorderBtn = document.getElementById("micPermissionBtn");
const statusText = document.getElementById("status");

openRecorderBtn.addEventListener("click", async () => {
  try {
    openRecorderBtn.disabled = true;

    if (statusText) {
      statusText.textContent = "Checking Google Meet tab...";
    }

    // Find the currently active tab
    const [meetTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    // Make sure a tab exists
    if (!meetTab || meetTab.id === undefined) {
      throw new Error("No active tab found.");
    }

    // Make sure the active tab is Google Meet
    if (
      !meetTab.url ||
      !meetTab.url.startsWith("https://meet.google.com/")
    ) {
      throw new Error("Please open Google Meet first.");
    }

    // Preserve the Meet tab ID in the recorder page URL
    const recorderUrl =
      chrome.runtime.getURL("mic-permission.html") +
      "?tabId=" + meetTab.id;

    // Open the recorder page
    await chrome.tabs.create({
      url: recorderUrl
    });

    window.close();

  } catch (error) {
    if (statusText) {
      statusText.textContent = "Error: " + error.message;
    }

    openRecorderBtn.disabled = false;
  }
});
