// scr/controllers/imageController.js

const { generateImageFromPrompt } = require("../services/comfyUIService");
const { uploadImageToS3 } = require("../services/s3Service");
const comfyUiWorkflow = require("../assets/comfyWorkflow.json");

// Bring in Prisma to query and update your database
const prisma = require("../db/prisma/client");

// If you want to add a fixed suffix/prefix, do so here:
const FIXED_PROMPT = " product rendering, 1QQQ";

/**
 * 1. Generate an image for a single product by ID.
 *
 *    - If the product doesn’t exist, or the `imageUrl` is not null,
 *      we skip image generation.
 *    - Otherwise, we grab the `prompt` column (fallback to `description`),
 *      concatenate with the FIXED_PROMPT, generate an image,
 *      upload to S3, and update the DB row.
 */
async function generateImageById(req, res) {
  console.log("==> [generateImageById] Function called.");

  try {
    const { id } = req.params;
    console.log("   -> Parsing 'id':", id);

    // Attempt to parse ID as integer
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      console.error("   !! Invalid product ID:", id);
      return res.status(400).json({ error: "Invalid product ID" });
    }
    console.log("   -> productId parsed as:", productId);

    // 1. Get the product by ID
    console.log(`   -> Fetching product with ID ${productId} from DB...`);
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    console.log("   -> Fetched product:", product);

    // 2. If product not found, respond and exit
    if (!product) {
      console.warn(`   -> Product with ID ${id} not found.`);
      return res
        .status(404)
        .json({ error: `Product with ID ${id} not found.` });
    }

    // 3. If `imageUrl` is already set, skip
    if (product.imageUrl) {
      console.log(
        `   -> Product ${id} already has an imageUrl. Skipping image generation.`
      );
      return res.json({
        success: true,
        message: `Product ${id} already has an imageUrl. Skipped.`,
        data: product,
      });
    }

    // 4. Get the userPrompt from `prompt` column or fallback to `description`
    let userPrompt = product.prompt;
    if (!userPrompt) {
      userPrompt = product.description || "Default prompt text if needed";
    }
    console.log("   -> Using userPrompt:", userPrompt);

    // You can append or prepend your fixed prompt
    const combinedPrompt = `${userPrompt}\n\n${FIXED_PROMPT}`;
    console.log("   -> Combined prompt:", combinedPrompt);

    // 5. Generate base64 from ComfyUI
    console.log("   -> Generating base64 image from ComfyUIService...");
    const base64Image = await generateImageFromPrompt(
      combinedPrompt,
      comfyUiWorkflow
    );
    console.log("   -> Base64 image generated (length):", base64Image.length);

    // 6. Upload image to AWS S3
    console.log(`   -> Uploading image to S3 with prefix: product_${id}`);
    const s3Url = await uploadImageToS3(base64Image, `product_${id}`);
    console.log("   -> Image uploaded to S3 URL:", s3Url);

    // 7. Update the DB record
    console.log("   -> Updating product record with new imageUrl...");
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: s3Url },
    });
    console.log("   -> Updated product:", updatedProduct);

    // 8. Return success
    console.log("==> [generateImageById] Finished successfully.");
    return res.json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Error in generateImageById:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * 2. Generate images for all products that have `imageUrl = null`.
 *    - Iterates over each matching product in series to avoid
 *      overloading the image generation API.
 *    - Similar logic to generateImageById, but for multiple products.
 */
async function generateMissingProductImages(req, res) {
  console.log("==> [generateMissingProductImages] Function called.");

  try {
    // 1. Get all products that have no imageUrl
    console.log("   -> Fetching products that have no imageUrl...");
    const products = await prisma.product.findMany({
      where: { imageUrl: null },
      orderBy: { id: "asc" }, // optional, but can help with consistent order
    });
    console.log(`   -> Found ${products.length} product(s) with no imageUrl.`);

    const updatedProducts = [];

    // 2. Process each product in series
    for (const product of products) {
      console.log(`   -> Processing product ID: ${product.id}...`);

      // Prompt fallback
      let userPrompt =
        product.prompt || product.description || "Default prompt text";
      console.log("      -> Original userPrompt:", userPrompt);

      const combinedPrompt = `${userPrompt}\n\n${FIXED_PROMPT}`;
      console.log("      -> Combined prompt:", combinedPrompt);

      // (A) Generate base64 from ComfyUI
      console.log("      -> Generating base64 image from ComfyUIService...");
      const base64Image = await generateImageFromPrompt(
        combinedPrompt,
        comfyUiWorkflow
      );
      console.log(
        "      -> Base64 image generated (length):",
        base64Image.length
      );

      // (B) Upload to S3
      console.log(
        `      -> Uploading image to S3 for product ID: ${product.id}`
      );
      const s3Url = await uploadImageToS3(base64Image, `product_${product.id}`);
      console.log("      -> S3 URL:", s3Url);

      // (C) Update product record with new imageUrl
      console.log("      -> Updating DB record...");
      const updatedProduct = await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: s3Url },
      });
      console.log("      -> Updated product:", updatedProduct);

      updatedProducts.push(updatedProduct);
      console.log(`   -> Finished processing product ID: ${product.id}\n`);
    }

    console.log(
      "==> [generateMissingProductImages] Finished. Returning response."
    );
    return res.json({
      success: true,
      data: updatedProducts,
    });
  } catch (error) {
    console.error("Error generating missing product images:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Example existing endpoint from your original code:
 * - If you still want a direct single-prompt approach (unrelated to DB).
 */
async function generateProductImage(req, res) {
  console.log("==> [generateProductImage] Function called.");
  try {
    const { userPrompt } = req.body;
    console.log("   -> Received userPrompt:", userPrompt);

    if (!userPrompt) {
      console.warn("   -> No userPrompt provided.");
      return res.status(400).json({ error: "userPrompt is required" });
    }

    // Generate a base64 image from the prompt
    console.log("   -> Generating base64 image from ComfyUIService...");
    const base64Image = await generateImageFromPrompt(
      userPrompt,
      comfyUiWorkflow
    );
    console.log("   -> Base64 image generated (length):", base64Image.length);

    // Upload that base64 image to S3
    console.log("   -> Uploading image to S3 with prefix: product-image");
    const s3Url = await uploadImageToS3(base64Image, "product-image");
    console.log("   -> Image uploaded to S3 URL:", s3Url);

    // Return the public S3 URL
    console.log("==> [generateProductImage] Finished successfully.");
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
  generateImageById,
  generateMissingProductImages,
  generateProductImage, // optional if you still want the direct route
};
