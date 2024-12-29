// scr/controllers/imageController.js
const { generateImageFromPrompt } = require("../services/comfyUIService");
const { uploadImageToS3 } = require("../services/s3Service");

// Suppose you store your big JSON in a file or a constant
// For simplicity, let's require it
const comfyUiWorkflow = require("../assets/comfyWorkflow.json");

// Example controller
async function generateProductImage(req, res) {
  try {
    // 1. Get user prompt from body
    const { userPrompt } = req.body;
    if (!userPrompt) {
      return res.status(400).json({ error: "userPrompt is required" });
    }

    // 2. Generate base64 from ComfyUI
    const base64Image = await generateImageFromPrompt(
      userPrompt,
      comfyUiWorkflow
    );

    // 3. Upload to S3
    const s3Url = await uploadImageToS3(base64Image, "product-image");

    // 4. Return the public URL
    return res.json({
      success: true,
      imageUrl: s3Url,
    });
  } catch (error) {
    console.error("Error generating product image:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  generateProductImage,
};
