// src/controllers/users/userController.js

const prisma = require("../../db/prisma/client");
const {
  generateMultipleUserDataWithCallback,
} = require("../../services/users/userChatGPTService");

/**
 * Generate multiple users and insert them into the DB (partial insert on error).
 */
async function generateUsers(req, res) {
  console.log("==> [generateUsers] Function called.");

  try {
    let { numberOfUsers } = req.body;
    if (!numberOfUsers || typeof numberOfUsers !== "number") {
      numberOfUsers = 50; // default
      console.log("   -> Using default of 50 users because none was provided.");
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
          gender,
        } = userData;

        let attempts = 0;
        const MAX_ATTEMPTS = 10;

        let tempUsername = username; // Start with ChatGPT's username
        let tempEmail = email; // Start with ChatGPT's email

        while (attempts < MAX_ATTEMPTS) {
          try {
            const createdUser = await prisma.user.create({
              data: {
                firstName,
                lastName,
                username: tempUsername,
                email: tempEmail,
                password,
                role: role || "USER",
                moneyNum: moneyNum ?? 0.0,
                favoriteProduct,
                prompt,
                gender,
              },
            });

            insertedUsers.push(createdUser);
            break; // success => exit while loop
          } catch (error) {
            // If it's a P2002 unique constraint violation on username or email, handle
            if (error.code === "P2002" && error.meta?.target) {
              attempts++;
              if (error.meta.target.includes("username")) {
                // Append random digits to username
                const suffix = Math.floor(Math.random() * 9000) + 1000;
                tempUsername = `${tempUsername}_${suffix}`;
                console.warn(
                  `Duplicate username: "${username}". Retrying with "${tempUsername}" (Attempt: ${attempts})`
                );
              } else if (error.meta.target.includes("email")) {
                // Append random digits to email local-part, e.g. "alice+1234@example.com"
                const randomNum = Math.floor(Math.random() * 9000) + 1000;
                // If email is "alice@example.com", we can do "alice+1234@example.com"
                // Or just do "alice1234@example.com"
                const [local, domain] = tempEmail.split("@");
                tempEmail = `${local}+${randomNum}@${domain}`;
                console.warn(
                  `Duplicate email: "${email}". Retrying with "${tempEmail}" (Attempt: ${attempts})`
                );
              }

              if (attempts >= MAX_ATTEMPTS) {
                console.error(
                  `Failed to insert user after ${MAX_ATTEMPTS} attempts due to repeated duplicates. Skipping user.`
                );
              }
            } else {
              // Not a P2002-username-or-email error => rethrow
              throw error;
            }
          }
        }
      }
    }

    // Generate user data in chunks, passing our callback
    await generateMultipleUserDataWithCallback(
      numberOfUsers,
      10,
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
