// src/controllers/users/userImageController.js

const prisma = require("../../../prisma/client");
const { uploadUserImageToS3 } = require("../../services/users/userS3Service");
// We no longer need `generateImageFromPrompt`, since we won't poll for base64
// Instead, we manually build ephemeral JSON + do a single POST /run
const axios = require("axios");
const userImageWorkflow = require("../../assets/userImageWorkflow.json");

// Import your config that loads from env:
const {
  comfyUIBaseUrl,
  runpodToken,
  serverPublicUrl,
} = require("../../config");
// e.g. config.js => module.exports = {
//   comfyUIBaseUrl: process.env.COMFYUI_BASE_URL,
//   runpodToken: process.env.RUNPOD_TOKEN,
//   serverPublicUrl: process.env.SERVER_PUBLIC_URL // The domain for Render or ngrok
// };

const FIXED_USER_PROMPT =
  "A friendly individual posing for a casual profile picture, looking directly at the camera";

/**
 * For a single user, we queue an ephemeral job.
 */
async function generateUserImageById(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // 1) Check user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res
        .status(404)
        .json({ error: `User with ID ${userId} not found.` });
    }

    if (user.userImageUrl) {
      return res.json({
        success: true,
        message: `User ${userId} already has a userImageUrl. Skipped.`,
        data: user,
      });
    }

    // 2) Build the final prompt
    const safeGender = user.gender || "Unknown";
    const safeUserPrompt = user.prompt || "";
    // Combine: gender + userPrompt + the fixed snippet
    const combinedPrompt = `
Gender: ${safeGender}
${safeUserPrompt}
${FIXED_USER_PROMPT}
`.trim();

    // 3) Build ephemeral job body
    const workflow = JSON.parse(JSON.stringify(userImageWorkflow));
    // Insert `combinedPrompt` into node "74"
    if (workflow?.input?.workflow["74"]?.inputs?.string !== undefined) {
      workflow.input.workflow["74"].inputs.string = combinedPrompt;
    }

    // Add `callbackUrl` + custom `userId`
    // Pull callback from env-based `serverPublicUrl`
    const callbackUrl = `${serverPublicUrl}/users/images/runpod-callback`;
    workflow.input.callbackUrl = callbackUrl;
    workflow.input.userId = userId; // So the container can pass it back to us

    // 4) POST to ephemeral /run
    const apiUrl = `${comfyUIBaseUrl}/run`; // e.g. https://api.runpod.ai/v2/<podId>/run
    const response = await axios.post(apiUrl, workflow, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runpodToken}`,
      },
    });

    // Typically, ephemeral returns { id: "...", status: "IN_QUEUE" }
    return res.json({
      success: true,
      message: "User image generation job queued.",
      ephemeralResponse: response.data,
    });
  } catch (error) {
    console.error("Error in generateUserImageById:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * For all users with null image, queue ephemeral jobs (no immediate base64).
 */
async function generateMissingUserImages(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { userImageUrl: null },
      orderBy: { id: "asc" },
    });

    const ephemeralResponses = [];

    for (const user of users) {
      const safeGender = user.gender || "Unknown";
      const safeUserPrompt = user.prompt || "";

      const combinedPrompt = `
Gender: ${safeGender}
${safeUserPrompt}
${FIXED_USER_PROMPT}
`.trim();

      // Build ephemeral job
      const workflow = JSON.parse(JSON.stringify(userImageWorkflow));
      if (workflow?.input?.workflow["74"]?.inputs?.string !== undefined) {
        workflow.input.workflow["74"].inputs.string = combinedPrompt;
      }

      // callbackUrl + userId
      const callbackUrl = `${serverPublicUrl}/users/images/runpod-callback`;
      workflow.input.callbackUrl = callbackUrl;
      workflow.input.userId = user.id;

      // POST to ephemeral /run
      const apiUrl = `${comfyUIBaseUrl}/run`;
      const response = await axios.post(apiUrl, workflow, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runpodToken}`,
        },
      });

      ephemeralResponses.push({
        userId: user.id,
        ephemeralData: response.data, // e.g. { id: "...", status: "IN_QUEUE" }
      });
    }

    return res.json({
      success: true,
      message: "Queued ephemeral jobs for all users missing images.",
      ephemeralResponses,
    });
  } catch (error) {
    console.error("Error in generateMissingUserImages:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Handler for the RunPod ephemeral callback.
 * Receives { jobId, userId, status, message (base64 or S3 link) }.
 */
async function handleRunpodCallback(req, res) {
  try {
    const { jobId, userId, status, message } = req.body;
    console.log(
      "=== [handleRunpodCallback] Received ephemeral callback:",
      req.body
    );

    if (!userId) {
      return res
        .status(400)
        .json({ error: "No userId in callback. Cannot proceed." });
    }

    // Check status
    if (status !== "success") {
      console.error(
        `Job ${jobId} for user ${userId} returned status=${status}. Skipping.`
      );
      return res.json({ success: false, message: "Not success status." });
    }

    // We assume the container returned base64
    const base64Image = message;

    // 1) Upload to S3
    const s3Url = await uploadUserImageToS3(base64Image, `user_${userId}`);
    console.log("Uploaded to S3:", s3Url);

    // 2) Update DB
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { userImageUrl: s3Url },
    });

    console.log(`User ${userId} image updated in DB: ${s3Url}`);

    // 3) Return a simple success
    return res.json({ success: true, updatedUser });
  } catch (error) {
    console.error("Error in handleRunpodCallback:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  generateUserImageById,
  generateMissingUserImages,
  handleRunpodCallback,
};
