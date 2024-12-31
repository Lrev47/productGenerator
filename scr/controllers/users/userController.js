// scr/controllers/userController.js

const prisma = require("../../db/prisma/client");
const {
  generateMultipleUserDataWithCallback,
} = require("../../services/userChatGPTService");

/**
 * Generate multiple users and insert them into the DB (partial insert on error).
 */
async function generateUsers(req, res) {
  console.log("==> [generateUsers] Function called.");

  try {
    let { numberOfUsers } = req.body;
    if (!numberOfUsers || typeof numberOfUsers !== "number") {
      numberOfUsers = 100; // default
    }

    const insertedUsers = [];
    async function onChunkReceived(chunk) {
      for (const userData of chunk) {
        const {
          firstName,
          lastName,
          username,
          email,
          password,
          role,
          moneyNum,
          favoriteProduct,
          prompt,
        } = userData;

        const newUser = await prisma.user.create({
          data: {
            firstName,
            lastName,
            username,
            email,
            password,
            role: role || "USER",
            moneyNum: moneyNum ?? 0.0,
            favoriteProduct,
            prompt,
          },
        });
        insertedUsers.push(newUser);
      }
    }

    await generateMultipleUserDataWithCallback(
      numberOfUsers,
      20,
      onChunkReceived
    );

    return res.json({
      success: true,
      data: insertedUsers,
    });
  } catch (error) {
    console.error("Error generating users:", error);
    return res.status(500).json({
      error: "Internal server error while generating users.",
    });
  }
}

module.exports = {
  generateUsers,
};
