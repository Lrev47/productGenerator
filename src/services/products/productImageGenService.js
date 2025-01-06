// src/services/productImageGenService.js

const axios = require("axios");
const { comfyUIBaseUrl, runpodToken } = require("../../config");

/**
 * buildWorkflowWithPrompt
 *  - Clones your productImageWorkflow JSON,
 *    inserts a userPrompt into node "74",
 *    sets callbackUrl + productId if needed.
 */
function buildWorkflowWithPrompt(
  originalWorkflow,
  userPrompt,
  callbackUrl,
  productId
) {
  // 1) Clone the workflow
  const workflow = JSON.parse(JSON.stringify(originalWorkflow));

  // 2) Insert the userPrompt into node "74"
  if (
    workflow?.input?.workflow &&
    workflow.input.workflow["74"]?.inputs?.string !== undefined
  ) {
    workflow.input.workflow["74"].inputs.string = userPrompt;
  } else {
    console.warn(
      "Node '74' not found or .inputs.string is missing in workflow."
    );
  }

  // 3) Set callbackUrl + productId in the workflow’s top-level input
  workflow.input.callbackUrl = callbackUrl; // e.g. "https://yourserver.com/api/products/images/runpod-callback"
  if (productId) {
    workflow.input.productId = productId; // ephemeral container sends back productId in callback
  }

  return workflow;
}

/**
 * startJobWithCallback
 *  - Sends the workflow data (with callbackUrl & productId) to the ephemeral /run endpoint.
 *  - Returns ephemeral response (e.g. { id, status, ... }).
 *  - Does NOT poll. Container calls back later with the final image.
 */
async function startJobWithCallback(workflowData) {
  console.log("=== [startJobWithCallback] Sending ephemeral job to RunPod...");

  try {
    const apiUrl = `${comfyUIBaseUrl}/run`; // e.g. https://api.runpod.ai/v2/<podId>/run

    // Single POST to ephemeral endpoint
    const response = await axios.post(apiUrl, workflowData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runpodToken}`,
      },
    });

    // Typically returns { id: "...", status: "IN_QUEUE" } or "IN_PROGRESS"
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

module.exports = {
  buildWorkflowWithPrompt, // Insert userPrompt + set callbackUrl/productId
  startJobWithCallback, // Post ephemeral workflow
};
