// src/controllers/users/userImageController.js

const prisma = require("../../db/prisma/client");
const {
  generateImageFromPrompt,
} = require("../../services/users/userImageGenService");
const { uploadUserImageToS3 } = require("../../services/users/userS3Service");
const userImageWorkflow = require("../../assets/userImageWorkflow.json");

// We keep a small "fixed" portion here in the controller:
const FIXED_USER_PROMPT =
  "A friendly individual posing for a casual profile picture, looking directly at the camera";

async function generateUserImageById(req, res) {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // 1) Find user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: `User with ID ${id} not found.` });
    }

    // 2) If image already set, skip
    if (user.userImageUrl) {
      return res.json({
        success: true,
        message: `User ${id} already has a userImageUrl. Skipped.`,
        data: user,
      });
    }

    // 3) Build the combined prompt
    const safeGender = user.gender || "Unknown";
    const safeUserPrompt = user.prompt || "";
    // Only combine gender + userPrompt + the fixed prompt:
    const combinedPrompt = `
Gender: ${safeGender}
${safeUserPrompt}
${FIXED_USER_PROMPT}
`.trim();

    // 4) Generate the base64 from ComfyUI
    const base64Image = await generateImageFromPrompt(
      combinedPrompt,
      userImageWorkflow
    );

    // 5) Upload to S3
    const s3Url = await uploadUserImageToS3(base64Image, `user_${userId}`);

    // 6) Update User record
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

async function generateMissingUserImages(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { userImageUrl: null },
      orderBy: { id: "asc" },
    });

    const updatedUsers = [];
    for (const user of users) {
      if (user.userImageUrl) {
        // If userImageUrl isn't null (just in case), skip
        continue;
      }

      const safeGender = user.gender || "Unknown";
      const safeUserPrompt = user.prompt || "";

      // Only combine gender + userPrompt + the fixed prompt:
      const combinedPrompt = `
Gender: ${safeGender}
${safeUserPrompt}
${FIXED_USER_PROMPT}
`.trim();

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
