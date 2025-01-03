// src/services/users/userImageGenService.js

const axios = require("axios");
const { comfyUIBaseUrl, runpodToken } = require("../../config");

/**
 * 1) START A JOB
 *    Sends workflow data to your RunPod ComfyUI endpoint to start a job,
 *    returning the job ID if successful.
 */
async function startJob(workflowData) {
  console.log("=== [startJob - USER] Starting job with data ===");
  console.log(JSON.stringify(workflowData, null, 2));

  try {
    const apiUrl = `${comfyUIBaseUrl}/run`;
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
async function pollJobStatus(jobId, maxRetries = 60, retryDelay = 5000) {
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
        outputData = response.data.output; // check if there's a different field
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
 *    Takes the final userPrompt (already including all text you want),
 *    inserts it into the userImageWorkflow JSON, starts the job,
 *    polls until completion, returns base64.
 */
async function generateImageFromPrompt(userPrompt, workflowJson) {
  console.log(
    "=== [generateImageFromPrompt - USER] Called with userPrompt: ==="
  );
  console.log(userPrompt);

  try {
    // We do NOT append any fixed prompt here; the userPrompt is already complete
    const finalPrompt = userPrompt.trim();
    console.log("=== [generateImageFromPrompt - USER] finalPrompt: ===");
    console.log(finalPrompt);

    // 1) Clone the workflow
    const workflow = JSON.parse(JSON.stringify(workflowJson));

    // 2) Insert finalPrompt into the node "74" (String Literal)
    if (
      workflow?.input?.workflow &&
      workflow.input.workflow["74"]?.inputs?.string !== undefined
    ) {
      workflow.input.workflow["74"].inputs.string = finalPrompt;
    } else {
      console.warn(
        "Node '74' not found or .inputs.string missing in workflow."
      );
    }

    console.log(
      "=== [generateImageFromPrompt - USER] Starting RunPod job with updated workflow... ==="
    );

    // 3) Start the job
    const jobId = await startJob(workflow);
    console.log(
      `=== [generateImageFromPrompt - USER] Job started. ID = ${jobId} ===`
    );

    // 4) Poll for completion
    const outputData = await pollJobStatus(jobId, 60, 5000);

    console.log(
      "=== [generateImageFromPrompt - USER] Job completed, outputData: ==="
    );
    console.log(outputData);

    // 5) Extract the base64 field
    const base64Image = outputData?.message;
    if (!base64Image) {
      throw new Error(
        "No base64 image found in outputData. Check container's response format."
      );
    }

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
