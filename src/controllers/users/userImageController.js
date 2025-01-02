// scr/controllers/userImageController.js

const prisma = require("../../db/prisma/client");
const {
  generateImageFromPrompt,
} = require("../../services/users/userImageGenService");
const { uploadUserImageToS3 } = require("../../services/users/userS3Service");
const userImageWorkflow = require("../../assets/userImageWorkflow.json");

// Fixed portion appended to user prompt
const FIXED_USER_PROMPT =
  "A friendly individual posing for a casual profile picture, looking directly at the camera";

/**
 * Generate an image for a single User by ID (stores in `userImageUrl`).
 */
async function generateUserImageById(req, res) {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: `User with ID ${id} not found.` });
    }

    if (user.userImageUrl) {
      return res.json({
        success: true,
        message: `User ${id} already has a userImageUrl. Skipped.`,
        data: user,
      });
    }

    // Combine any user name or role into a prompt, or do your own logic
    let userPrompt = `${user.firstName} ${user.lastName}, role: ${user.role}`;
    const combinedPrompt = `${userPrompt}\n\n${FIXED_USER_PROMPT}`;

    // Generate base64
    const base64Image = await generateImageFromPrompt(
      combinedPrompt,
      userImageWorkflow
    );

    // Upload
    const s3Url = await uploadUserImageToS3(base64Image, `user_${id}`);

    // Update User record
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { userImageUrl: s3Url },
    });

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Error in generateUserImageById:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Generate images for all Users who have `userImageUrl = null`.
 */
async function generateMissingUserImages(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { userImageUrl: null },
      orderBy: { id: "asc" },
    });

    const updatedUsers = [];
    for (const user of users) {
      let userPrompt = `${user.firstName} ${user.lastName}, role: ${user.role}`;
      const combinedPrompt = `${userPrompt}\n\n${FIXED_USER_PROMPT}`;

      const base64Image = await generateImageFromPrompt(
        combinedPrompt,
        userImageWorkflow
      );
      const s3Url = await uploadUserImageToS3(base64Image, `user_${user.id}`);

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { userImageUrl: s3Url },
      });
      updatedUsers.push(updatedUser);
    }

    return res.json({ success: true, data: updatedUsers });
  } catch (error) {
    console.error("Error in generateMissingUserImages:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  generateUserImageById,
  generateMissingUserImages,
};
