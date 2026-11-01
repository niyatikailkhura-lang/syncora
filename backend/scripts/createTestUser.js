
require("dotenv").config();

const bcrypt = require("bcryptjs");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");

async function createTestUser() {
  try {
    await connectDB();

    const email = "manager@teamos.com";
    const password = "Test@12345";

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("Test user already exists");
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name: "TeamOS Manager",
      email,
      passwordHash,
      role: "manager"
    });

    console.log("Test user created successfully!");
    console.log("Email:", user.email);

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  }
}

createTestUser();
