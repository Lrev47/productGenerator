// src/services/userImageGenService.js

const axios = require("axios");
const { comfyUIBaseUrl, runpodToken } = require("../../config");

/**
 * (Optional) If you want a fixed portion appended to the user prompt, edit here:
 */
const FIXED_PROMPT =
  "A friendly individual posing for a casual profile picture, looking directly at the camera";

/**
 * 1) START A JOB
 *    Sends workflow data to your RunPod ComfyUI endpoint to start a job,
 *    returning the job ID if successful.
 */
async function startJob(workflowData) {
  console.log("=== [startJob - USER] Starting job with data ===");
  console.log(JSON.stringify(workflowData, null, 2));

  try {
    const apiUrl = `${comfyUIBaseUrl}/run`; // e.g., https://api.runpod.ai/v2/your-endpoint/run
    const response = await axios.post(apiUrl, workflowData, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runpodToken}`, // If your RunPod instance requires a bearer token
      },
    });

    console.log("=== [startJob - USER] Job started, response data: ===");
    console.log(response.data);

    // Assuming response.data has an "id" field for the job ID
    return response.data.id;
  } catch (error) {
    console.error("=== [startJob - USER] Error starting job ===");
    if (error.response) {
      console.error("Response data:", error.response.data);
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

/**
 * 2) POLL JOB STATUS
 *    Polls the job until completion or until maxRetries is reached.
 */
async function pollJobStatus(jobId, maxRetries = 120, retryDelay = 5000) {
  let isCompleted = false;
  let outputData = null;
  let retries = 0;

  while (!isCompleted && retries < maxRetries) {
    console.log(
      `=== [pollJobStatus - USER] Checking job ${jobId}, attempt ${
        retries + 1
      } ===`
    );

    try {
      const response = await axios.get(`${comfyUIBaseUrl}/status/${jobId}`, {
        headers: {
          Authorization: `Bearer ${runpodToken}`,
        },
      });

      console.log("=== [pollJobStatus - USER] Status response data: ===");
      console.log(response.data);

      if (response.data.status === "COMPLETED") {
        isCompleted = true;
        outputData = response.data.output; // Adjust if needed based on your container
      } else if (response.data.status === "FAILED") {
        throw new Error(
          `Job failed: ${JSON.stringify(response.data, null, 2)}`
        );
      } else {
        console.log(
          `Job status is ${response.data.status}. Waiting ${
            retryDelay / 1000
          }s before next attempt...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retries++;
      }
    } catch (error) {
      console.error("=== [pollJobStatus - USER] Error polling job status ===");
      if (error.response) {
        console.error("Response data:", error.response.data);
      } else {
        console.error(error.message);
      }
      throw error;
    }
  }

  if (!isCompleted) {
    throw new Error("Max retries reached. Job polling timed out.");
  }

  return outputData;
}

/**
 * 3) generateImageFromPrompt
 *    Combines userPrompt + FIXED_PROMPT, inserts into your userImageWorkflow.json,
 *    starts the job, polls until completion, and returns the base64 image string.
 */
async function generateImageFromPrompt(userPrompt, workflowJson) {
  console.log(
    "=== [generateImageFromPrompt - USER] Called with userPrompt: ==="
  );
  console.log(userPrompt);

  try {
    // Combine user prompt + the fixed part
    const combinedPrompt = `${userPrompt}\n\n${FIXED_PROMPT}`.trim();
    console.log("=== [generateImageFromPrompt - USER] Combined prompt: ===");
    console.log(combinedPrompt);

    // Clone the workflow so we don't mutate the original JSON
    const workflow = JSON.parse(JSON.stringify(workflowJson));

    // Insert combinedPrompt into the node that holds the prompt, e.g. node "74" in your workflow
    if (
      workflow?.input?.workflow &&
      workflow.input.workflow["74"]?.inputs?.string !== undefined
    ) {
      workflow.input.workflow["74"].inputs.string = combinedPrompt;
    } else {
      console.warn(
        "Node '74' not found in userImageWorkflow or inputs.string is missing."
      );
    }

    console.log(
      "=== [generateImageFromPrompt - USER] Starting RunPod job with userImageWorkflow.json... ==="
    );

    // 1) Start the job
    const jobId = await startJob(workflow);
    console.log(
      `=== [generateImageFromPrompt - USER] Job started. ID = ${jobId} ===`
    );

    // 2) Poll the job status
    const outputData = await pollJobStatus(jobId, 60, 5000);

    console.log(
      "=== [generateImageFromPrompt - USER] Job completed, outputData: ==="
    );
    console.log(outputData);

    // Adjust the property name if your container returns the base64 differently:
    const base64Image = outputData?.message;
    if (!base64Image) {
      throw new Error(
        "No base64 image found in outputData. Check your container's response field."
      );
    }

    // Return the base64 string
    return base64Image;
  } catch (error) {
    console.error(
      "=== [generateImageFromPrompt - USER] Error generating image ==="
    );
    console.error(error);
    throw error;
  }
}

module.exports = {
  startJob,
  pollJobStatus,
  generateImageFromPrompt,
};
