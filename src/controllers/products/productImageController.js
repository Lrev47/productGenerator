const prisma = require("../../../prisma/client");
const productImageWorkflow = require("../../assets/productImageWorkflow.json");
const {
  uploadProductImageToS3,
} = require("../../services/products/productS3Service");
const {
  comfyUIBaseUrl,
  runpodToken,
  serverPublicUrl,
} = require("../../config");
const axios = require("axios");

/**
 * A small "fixed" prompt snippet if you want (optional).
 * E.g. "A product on a white background"
 */
const FIXED_PROMPT = "A high-quality product rendering on a white background.";

/**
 * Generate an image for a specific product by ID (ephemeral callback approach).
 * - If product.imageUrl already exists, skip.
 * - Construct a combined prompt into node "74" of productImageWorkflow.
 * - POST to ephemeral /run with callbackUrl to /api/products/images/runpod-callback
 */
async function generateProductImageById(req, res) {
  const logs = [];
  try {
    const productId = parseInt(req.params.id, 10);
    logs.push(
      `(generateProductImageById) Received request for productId=${productId}`
    );

    if (isNaN(productId)) {
      logs.push("Invalid product ID (NaN).");
      return res.status(400).json({ error: "Invalid product ID", logs });
    }

    // 1) Fetch product
    logs.push(`Fetching product with ID=${productId}...`);
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      logs.push(`Product not found.`);
      return res
        .status(404)
        .json({ error: `Product ${productId} not found.`, logs });
    }
    logs.push(`Found product: ${JSON.stringify(product)}`);

    // Check if imageUrl is already set
    if (product.imageUrl) {
      logs.push("Product already has an imageUrl. Skipping generation.");
      return res.json({
        success: true,
        message: `Product ${productId} already has an imageUrl. Skipped.`,
        data: product,
        logs,
      });
    }

    // 2) Build prompt
    const userPrompt = product.prompt || product.description || "";
    const combinedPrompt = `${userPrompt}\n${FIXED_PROMPT}`.trim();
    logs.push(`Constructed prompt: ${combinedPrompt}`);

    // 3) Build ephemeral job body (clone workflow)
    const workflow = JSON.parse(JSON.stringify(productImageWorkflow));
    if (workflow?.input?.workflow["74"]?.inputs?.string !== undefined) {
      workflow.input.workflow["74"].inputs.string = combinedPrompt;
      logs.push("Injected combined prompt into workflow node 74.");
    } else {
      logs.push("Warning: Could not find node 74 to inject prompt!");
    }

    // Set callbackUrl + productId
    const callbackUrl = `${serverPublicUrl}/api/products/images/runpod-callback`;
    workflow.input.callbackUrl = callbackUrl;
    workflow.input.productId = productId;
    logs.push(`Set callbackUrl=${callbackUrl} and productId=${productId}`);

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

    // Return success
    return res.json({
      success: true,
      message: "Product image generation job queued.",
      ephemeralResponse: response.data,
      logs,
    });
  } catch (error) {
    console.error("Error in generateProductImageById:", error);
    return res.status(500).json({
      error: "Internal server error",
      logs: [`Caught exception: ${error.message}`],
    });
  }
}

/**
 * Generate images for all products that have imageUrl = null.
 * - Loops through each product
 * - POST ephemeral job to generate the image
 * - ephemeral container will callback to /runpod-callback
 */
async function generateMissingProductImages(req, res) {
  const logs = [];
  try {
    logs.push(
      "(generateMissingProductImages) Fetching products with null image..."
    );
    const products = await prisma.product.findMany({
      where: { imageUrl: null },
      orderBy: { id: "asc" },
    });
    logs.push(`Found ${products.length} products missing images.`);

    const ephemeralResponses = [];

    // Loop
    for (const product of products) {
      const userPrompt = product.prompt || product.description || "";
      const combinedPrompt = `${userPrompt}\n${FIXED_PROMPT}`.trim();

      logs.push(`Building workflow for productId=${product.id}`);
      const workflow = JSON.parse(JSON.stringify(productImageWorkflow));
      if (workflow?.input?.workflow["74"]?.inputs?.string !== undefined) {
        workflow.input.workflow["74"].inputs.string = combinedPrompt;
        logs.push(`Injected prompt for productId=${product.id}`);
      } else {
        logs.push(`Warning: No node 74 for productId=${product.id}?`);
      }

      const callbackUrl = `${serverPublicUrl}/api/products/images/runpod-callback`;
      workflow.input.callbackUrl = callbackUrl;
      workflow.input.productId = product.id;

      // POST ephemeral /run
      logs.push(`Posting ephemeral job for productId=${product.id}...`);
      const apiUrl = `${comfyUIBaseUrl}/run`;
      const response = await axios.post(apiUrl, workflow, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${runpodToken}`,
        },
      });
      ephemeralResponses.push({
        productId: product.id,
        ephemeralData: response.data,
      });
      logs.push(
        `Ephemeral response for productId=${product.id}: ${JSON.stringify(
          response.data
        )}`
      );
    }

    return res.json({
      success: true,
      message: "Queued ephemeral jobs for all products missing images.",
      ephemeralResponses,
      logs,
    });
  } catch (error) {
    console.error("Error in generateMissingProductImages:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * handleRunpodCallback - ephemeral container calls back here with base64 image.
 * - request body => { jobId, productId, status, message (base64) }
 * - if status=success => upload to S3, update DB
 */
async function handleRunpodCallback(req, res) {
  const logs = [];
  try {
    logs.push(
      `(handleRunpodCallback) Received callback: ${JSON.stringify(req.body)}`
    );

    const { jobId, productId, status, message } = req.body;

    if (!productId) {
      logs.push("No productId in callback; cannot proceed.");
      return res.status(400).json({ error: "No productId in callback.", logs });
    }

    // Check status
    if (status !== "success") {
      logs.push(
        `Job ${jobId} productId=${productId} returned status=${status}. Skipping update.`
      );
      return res.json({ success: false, message: "Not success status.", logs });
    }

    // We assume container returned base64 in 'message'
    logs.push(
      "Received base64 image from ephemeral container. Uploading to S3..."
    );
    const base64Image = message;
    const s3Url = await uploadProductImageToS3(
      base64Image,
      `product_${productId}`
    );
    logs.push(`Uploaded to S3: ${s3Url}`);

    // Update DB
    logs.push(`Updating product record id=${productId} with image URL...`);
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: s3Url },
    });
    logs.push(`DB updated for productId=${productId}. imageUrl=${s3Url}`);

    return res.json({ success: true, updatedProduct, logs });
  } catch (error) {
    console.error("Error in handleRunpodCallback:", error);
    return res.status(500).json({
      error: "Internal server error",
      logs: [`Caught exception: ${error.message}`],
    });
  }
}

module.exports = {
  generateProductImageById,
  generateMissingProductImages,
  handleRunpodCallback,
};
