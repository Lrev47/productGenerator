// src/controllers/users/userImageController.js

const prisma = require("../../../prisma/client");
const { uploadUserImageToS3 } = require("../../services/users/userS3Service");
const axios = require("axios");
const userImageWorkflow = require("../../assets/userImageWorkflow.json");
const {
  comfyUIBaseUrl,
  runpodToken,
  serverPublicUrl,
} = require("../../config");

const FIXED_USER_PROMPT =
  "A friendly individual posing for a casual profile picture, looking directly at the camera";

async function generateUserImageById(req, res) {
  // We'll accumulate logs in an array and return them in the final JSON:
  const logs = [];
  try {
    const userId = parseInt(req.params.id, 10);
    logs.push(`(generateUserImageById) Received request for userId=${userId}`);

    if (isNaN(userId)) {
      logs.push("Invalid user ID (NaN).");
      return res.status(400).json({ error: "Invalid user ID", logs });
    }

    // 1) Fetch user
    logs.push(`Fetching user with ID=${userId}...`);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logs.push(`User not found.`);
      return res.status(404).json({ error: `User ${userId} not found.`, logs });
    }
    logs.push(`Found user: ${JSON.stringify(user)}`);

    // Check if userImageUrl already exists
    if (user.userImageUrl) {
      logs.push("User already has a userImageUrl. Skipping generation.");
      return res.json({
        success: true,
        message: `User ${userId} already has a userImageUrl. Skipped.`,
        data: user,
        logs,
      });
    }

    // 2) Build prompt
    const safeGender = user.gender || "Unknown";
    const safeUserPrompt = user.prompt || "";
    const combinedPrompt = `
Gender: ${safeGender}
${safeUserPrompt}
${FIXED_USER_PROMPT}
`.trim();
    logs.push(`Constructed prompt: ${combinedPrompt}`);

    // 3) Build ephemeral job body
    const workflow = JSON.parse(JSON.stringify(userImageWorkflow));
    if (workflow?.input?.workflow["74"]?.inputs?.string !== undefined) {
      workflow.input.workflow["74"].inputs.string = combinedPrompt;
      logs.push("Injected combined prompt into workflow node 74.");
    } else {
      logs.push("Warning: Could not find node 74 to inject prompt!");
    }

    const callbackUrl = `${serverPublicUrl}/api/users/images/runpod-callback`;
    workflow.input.callbackUrl = callbackUrl;
    workflow.input.userId = userId;
    logs.push(`Set callbackUrl=${callbackUrl} and userId=${userId}`);

    // 4) POST to ephemeral /run
    const apiUrl = `${comfyUIBaseUrl}/run`;
    logs.push(`Sending POST to ephemeral endpoint: ${apiUrl}`);
    const response = await axios.post(apiUrl, workflow, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runpodToken}`,
      },
    });
    logs.push(`Ephemeral /run response: ${JSON.stringify(response.data)}`);

    // Return
    return res.json({
      success: true,
      message: "User image generation job queued.",
      ephemeralResponse: response.data,
      logs,
    });
  } catch (error) {
    console.error("Error in generateUserImageById:", error);
    return res.status(500).json({
      error: "Internal server error",
      logs: [`Caught exception: ${error.message}`],
    });
  }
}

async function generateMissingUserImages(req, res) {
  const logs = [];
  try {
    logs.push("(generateMissingUserImages) Fetching users with null image...");
    const users = await prisma.user.findMany({
      where: { userImageUrl: null },
      orderBy: { id: "asc" },
    });
    logs.push(`Found ${users.length} users missing images.`);

    const ephemeralResponses = [];

    // Loop through each user
    for (const user of users) {
      const safeGender = user.gender || "Unknown";
      const safeUserPrompt = user.prompt || "";
      const combinedPrompt = `
Gender: ${safeGender}
${safeUserPrompt}
${FIXED_USER_PROMPT}
`.trim();

      logs.push(`Building workflow for userId=${user.id}`);

      const workflow = JSON.parse(JSON.stringify(userImageWorkflow));
      if (workflow?.input?.workflow["74"]?.inputs?.string !== undefined) {
        workflow.input.workflow["74"].inputs.string = combinedPrompt;
        logs.push(`Injected prompt for userId=${user.id}`);
      } else {
        logs.push(`Warning: No node 74 for userId=${user.id}?`);
      }

      const callbackUrl = `${serverPublicUrl}/api/users/images/runpod-callback`;
      workflow.input.callbackUrl = callbackUrl;
      workflow.input.userId = user.id;

      // POST to ephemeral /run
      logs.push(`Posting ephemeral job for userId=${user.id}...`);
      const apiUrl = `${comfyUIBaseUrl}/run`;
      const response = await axios.post(apiUrl, workflow, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runpodToken}`,
        },
      });
      ephemeralResponses.push({
        userId: user.id,
        ephemeralData: response.data,
      });
      logs.push(
        `Ephemeral response for userId=${user.id}: ${JSON.stringify(
          response.data
        )}`
      );
    }

    return res.json({
      success: true,
      message: "Queued ephemeral jobs for all users missing images.",
      ephemeralResponses,
      logs,
    });
  } catch (error) {
    console.error("Error in generateMissingUserImages:", error);
    logs.push(`Caught exception: ${error.message}`);
    return res.status(500).json({ error: "Internal server error", logs });
  }
}

async function handleRunpodCallback(req, res) {
  const logs = [];
  try {
    logs.push(
      `(handleRunpodCallback) Received callback: ${JSON.stringify(req.body)}`
    );
    const { jobId, userId, status, message } = req.body;

    if (!userId) {
      logs.push("No userId in callback; cannot proceed.");
      return res.status(400).json({ error: "No userId in callback.", logs });
    }

    // Check status
    if (status !== "success") {
      logs.push(
        `Job ${jobId} userId=${userId} returned status=${status}. Skipping update.`
      );
      return res.json({ success: false, message: "Not success status.", logs });
    }

    // Assume container returned base64
    logs.push(
      "Received base64 image from ephemeral container. Uploading to S3..."
    );
    const base64Image = message;
    const s3Url = await uploadUserImageToS3(base64Image, `user_${userId}`);
    logs.push(`Uploaded to S3: ${s3Url}`);

    // Update DB
    logs.push(`Updating user record id=${userId} with image URL...`);
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { userImageUrl: s3Url },
    });
    logs.push(`DB updated for userId=${userId}. userImageUrl=${s3Url}`);

    // Success
    return res.json({ success: true, updatedUser, logs });
  } catch (error) {
    console.error("Error in handleRunpodCallback:", error);
    return res.status(500).json({
      error: "Internal server error",
      logs: [`Caught exception: ${error.message}`],
    });
  }
}

module.exports = {
  generateUserImageById,
  generateMissingUserImages,
  handleRunpodCallback,
};
