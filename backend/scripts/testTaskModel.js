const Task = require("../src/models/Task");

async function testTaskModel() {
  const task = new Task({
  createdBy: "6ae4abf59cf5d6a40bee21fc",
  source: "meeting_ai",
  title: "Submit project report",
  priority: "high"
});
  try {
    await task.validate();
    console.log("✅ Personal task validation passed!");
    console.log("Meeting ID:", task.meetingId);
    console.log("Source:", task.source);
    console.log("Priority:", task.priority);
  } catch (error) {
    console.log("❌ Validation failed:");
    console.log(error.message);
  }
}

testTaskModel();