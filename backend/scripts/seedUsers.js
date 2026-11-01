
require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");

const testUsers = [
  {
    name: "Syncora Student",
    email: "student@syncora.com",
    role: "student",
    workspaceType: "student"
  },
  {
    name: "Syncora Organiser",
    email: "organiser@syncora.com",
    role: "organiser",
    workspaceType: "event"
  },
  {
    name: "Syncora Team Member",
    email: "member@syncora.com",
    role: "team_member",
    workspaceType: "event"
  },
  {
    name: "Syncora Employee",
    email: "employee@syncora.com",
    role: "employee",
    workspaceType: "commercial"
  },
  {
    name: "Syncora Developer",
    email: "developer@syncora.com",
    role: "developer",
    workspaceType: "developers"
  },
  {
    name: "Syncora Stakeholder",
    email: "stakeholder@syncora.com",
    role: "stakeholder",
    workspaceType: "developers"
  }
];

async function seedUsers() {
  try {
    await connectDB();

    const passwordHash = await bcrypt.hash("Syncora@123", 10);

    for (const userData of testUsers) {
      const existingUser = await User.findOne({
        email: userData.email
      });

      if (existingUser) {
        console.log(`Already exists: ${userData.email}`);
        continue;
      }

      await User.create({
        ...userData,
        passwordHash
      });

      console.log(`Created: ${userData.email}`);
    }

    console.log("\nTest users seeding completed!");
  } catch (error) {
    console.error("Seeding error:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

seedUsers();

