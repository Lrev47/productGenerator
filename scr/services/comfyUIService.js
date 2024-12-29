// scr/services/comfyUIService.js
const axios = require("axios");

// Adjust to your actual ComfyUI base URL
const COMFYUI_URL = "http://localhost:8188";

const FIXED_PROMPT = `
Product rendering scene, a red earphone placed on the seasand ground, 
blue sea, pearl, clouds, science fiction concept style, 3D rendering, 
octane rendering, gloss, reflection, black and gold, glowing beige, 
product rendering, award-winning rendering, award-winning digital rendering, 
Autodesk 3D rendering, high-definition 3D rendering, product rendering, ue5, 1QQQ
`;

/**
 * Given a base workflow JSON, inserts the prompt and sends to ComfyUI.
 * Returns a base64 string of the image.
 */
async function generateImageFromPrompt(userPrompt, baseWorkflowJson) {
  try {
    // Combine user prompt + fixed prompt however you like:
    const combinedPrompt = `${userPrompt}\n\n${FIXED_PROMPT}`.trim();

    // Clone the workflow JSON so we don't mutate original
    const workflow = JSON.parse(JSON.stringify(baseWorkflowJson));

    // Insert the prompt into the workflow at node "74"
    // This node was "String Literal (Image Saver)" in your JSON
    // So we set the .inputs.string = combinedPrompt
    workflow.input.workflow["74"].inputs.string = combinedPrompt;

    // Now call ComfyUI at e.g. POST /generate
    const response = await axios.post(`${COMFYUI_URL}/generate`, workflow, {
      responseType: "arraybuffer", // if it returns raw binary
    });

    // If ComfyUI actually returns base64 in JSON:
    // const response = await axios.post(`${COMFYUI_URL}/generate`, workflow);

    // If your ComfyUI server directly returns a base64 string:
    //   const base64Image = response.data;

    // ----
    // BUT in your front-end code, you often do "startJob + pollJobStatus".
    // If ComfyUI simply returns the final base64 immediately, that's simpler.
    // We'll assume the server returns base64 in JSON { image: "base64string" } for example:

    // Convert data from buffer -> JSON (if it's JSON)
    const resultString = Buffer.from(response.data).toString("utf-8");
    const resultJson = JSON.parse(resultString);

    const base64Image = resultJson.image; // or whatever key it uses
    if (!base64Image) {
      throw new Error("No base64 image found in ComfyUI response.");
    }

    return base64Image;
  } catch (error) {
    console.error("Error generating image from ComfyUI:", error);
    throw error;
  }
}

module.exports = {
  generateImageFromPrompt,
};
