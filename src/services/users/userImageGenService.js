// src/services/users/userImageGenService.js

const axios = require("axios");
const { comfyUIBaseUrl, runpodToken } = require("../../config");

/**
 * startJobWithCallback
 *  - Sends workflow data (including callbackUrl) to RunPod ephemeral /run.
 *  - Returns the ephemeral response (like { id: "...", status: "IN_QUEUE" }).
 *  - No polling—once the container finishes, it calls our callbackUrl automatically.
 */
async function startJobWithCallback(workflowData) {
  console.log("=== [startJobWithCallback] Sending ephemeral job to RunPod...");

  try {
    const apiUrl = `${comfyUIBaseUrl}/run`; // e.g. https://api.runpod.ai/v2/<podId>/run

    // Fire the request once, no poll
    const response = await axios.post(apiUrl, workflowData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runpodToken}`,
      },
    });

    // Typically returns { id: "xyz", status: "IN_QUEUE" } or "IN_PROGRESS"
    console.log(
      "=== [startJobWithCallback] Ephemeral response:",
      response.data
    );
    return response.data; // e.g. { id, status, ... }
  } catch (error) {
    console.error(
      "=== [startJobWithCallback] Error starting ephemeral job ==="
    );
    if (error.response) {
      console.error("Response data:", error.response.data);
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

/**
 * buildWorkflowWithPrompt
 *  - Utility for injecting a dynamic prompt (like "Gender: X ...") into node "74" of your workflow JSON.
 *  - You can also set callbackUrl and userId here, or do that in your controller.
 */
function buildWorkflowWithPrompt(
  originalWorkflow,
  promptString,
  callbackUrl,
  userId
) {
  // 1) Clone the workflow
  const workflow = JSON.parse(JSON.stringify(originalWorkflow));

  // 2) Insert the prompt into node 74
  if (
    workflow?.input?.workflow &&
    workflow.input.workflow["74"]?.inputs?.string !== undefined
  ) {
    workflow.input.workflow["74"].inputs.string = promptString;
  } else {
    console.warn("Node '74' not found or .inputs.string missing in workflow.");
  }

  // 3) Attach callbackUrl + userId if needed
  workflow.input.callbackUrl = callbackUrl; // e.g. "https://yourserver.com/users/images/runpod-callback"
  if (userId) {
    workflow.input.userId = userId;
  }

  return workflow;
}

module.exports = {
  startJobWithCallback,
  buildWorkflowWithPrompt,
};
