// src/controllers/productImageController.js

const prisma = require("../../../prisma/client");
const {
  generateImageFromPrompt,
} = require("../../services/products/productImageGenService");
const { uploadImageToS3 } = require("../../services/products/productS3Service");
const comfyUiWorkflow = require("../../assets/ProductImageWorkflow.json");

// Optional fixed prompt for additional context:
const FIXED_PROMPT = "product rendering, 1QQQ";

/**
 * Generate an image for a single product by its ID.
 * - If `imageUrl` already exists, skip.
 * - If no `prompt` exists, use `description`.
 * - Append a fixed prompt if desired.
 * - Generate the image, upload to S3, and update the DB.
 */
async function generateImageById(req, res) {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    // 1. Fetch product from DB
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return res
        .status(404)
        .json({ error: `Product with ID ${productId} not found.` });
    }

    // 2. If image already set, skip generation
    if (product.imageUrl) {
      return res.json({
        success: true,
        message: `Product ${productId} already has an imageUrl. Skipped.`,
        data: product,
      });
    }

    // 3. Determine prompt text
    const userPrompt =
      product.prompt || product.description || "Default prompt text";
    const combinedPrompt = `${userPrompt}\n\n${FIXED_PROMPT}`;

    // 4. Generate image (base64) via ComfyUI
    const base64Image = await generateImageFromPrompt(
      combinedPrompt,
      comfyUiWorkflow
    );

    // 5. Upload to S3
    const s3Url = await uploadImageToS3(base64Image, `product_${productId}`);

    // 6. Update DB record
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: s3Url },
    });

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
 * Generate images for all products that have `imageUrl = null`.
 * Processes each product in a loop to avoid overloading the image generation API.
 */
async function generateMissingProductImages(req, res) {
  try {
    // 1. Fetch products without an image
    const products = await prisma.product.findMany({
      where: { imageUrl: null },
      orderBy: { id: "asc" },
    });

    const updatedProducts = [];
    for (const product of products) {
      const userPrompt =
        product.prompt || product.description || "Default prompt text";
      const combinedPrompt = `${userPrompt}\n\n${FIXED_PROMPT}`;

      const base64Image = await generateImageFromPrompt(
        combinedPrompt,
        comfyUiWorkflow
      );
      const s3Url = await uploadImageToS3(base64Image, `product_${product.id}`);

      const updatedProduct = await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: s3Url },
      });
      updatedProducts.push(updatedProduct);
    }

    return res.json({
      success: true,
      data: updatedProducts,
    });
  } catch (error) {
    console.error("Error generating missing product images:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  generateImageById,
  generateMissingProductImages,
};
