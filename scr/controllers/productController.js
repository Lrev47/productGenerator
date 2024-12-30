// scr/controllers/productController.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient(); // Initialize Prisma

const {
  generateMultipleProductData,
  generateProductDescriptionPrompt,
} = require("../services/chatgptService");
const { generateImageFromPrompt } = require("../services/comfyUIService");
const { uploadImageToS3 } = require("../services/s3Service");

/**
 * STEP 1: Generate multiple products and store them using Prisma
 */
async function generateProducts(req, res) {
  console.log("==> [generateProducts] Function called.");

  try {
    const { numberOfProducts } = req.body;
    console.log(
      "   -> numberOfProducts (from request body):",
      numberOfProducts
    );

    if (!numberOfProducts || typeof numberOfProducts !== "number") {
      console.warn("   -> Invalid or missing numberOfProducts.");
      return res.status(400).json({
        error: "Please provide a valid numberOfProducts (number).",
      });
    }

    // 1. Use ChatGPT to generate an array of product data
    console.log("   -> Generating multiple product data via ChatGPT...");
    const productDataArray = await generateMultipleProductData(
      numberOfProducts
    );
    console.log(
      `   -> Received ${productDataArray.length} products from ChatGPT.`
    );

    // 2. Insert each generated product into the database via Prisma
    const insertedProducts = [];
    for (const productData of productDataArray) {
      const { name, category, price, rating, description, prompt, quantity } =
        productData;
      console.log("   -> Creating product in DB:", productData);

      // Create the product in the Product table
      const newProduct = await prisma.product.create({
        data: {
          name,
          category,
          price,
          inStock: true, // default
          quantity: quantity ?? 0,
          rating: rating ?? 0,
          description,
          prompt,
        },
      });
      console.log("   -> Inserted product with ID:", newProduct.id);

      insertedProducts.push(newProduct);
    }

    console.log("==> [generateProducts] Finished successfully.");
    return res.status(200).json({
      success: true,
      data: insertedProducts,
    });
  } catch (error) {
    console.error("Error generating products:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * STEP 2: Generate images for existing products based on their prompt
 */
async function generateProductImages(req, res) {
  console.log("==> [generateProductImages] Function called.");

  try {
    const { productIds } = req.body;
    console.log("   -> productIds (from request body):", productIds);

    if (!productIds || !Array.isArray(productIds)) {
      console.warn("   -> Invalid or missing productIds array.");
      return res
        .status(400)
        .json({ error: "Please provide an array of productIds." });
    }

    const updatedProducts = [];

    // For each productId, fetch/update using Prisma
    for (const productId of productIds) {
      console.log(`   -> Processing product with ID: ${productId}`);

      // 1. Get product from DB
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      console.log("      -> Fetched product:", product);

      if (!product) {
        console.warn(
          `      -> Product with id ${productId} not found. Skipping...`
        );
        continue;
      }

      // If there's already an imageUrl, skip or decide if you want to regenerate
      if (product.imageUrl) {
        console.log(
          `      -> Product ${productId} already has an image. Skipping...`
        );
        updatedProducts.push(product);
        continue;
      }

      // 2. If there's no prompt, generate it from the product's description
      let prompt = product.prompt;
      if (!prompt) {
        console.log(
          "      -> No existing prompt found. Generating from description..."
        );
        prompt = await generateProductDescriptionPrompt(product.description);
      }
      console.log("      -> Using prompt:", prompt);

      // 3. Generate image with ComfyUI
      console.log("      -> Generating base64 image from prompt...");
      const imageBuffer = await generateImageFromPrompt(prompt);
      console.log(
        "      -> Base64 image generated (length):",
        imageBuffer.length
      );

      // 4. Upload image to AWS S3
      console.log(`      -> Uploading image to S3 with prefix: ${prompt}`);
      const imageUrl = await uploadImageToS3(imageBuffer, prompt);
      console.log("      -> S3 Image URL:", imageUrl);

      // 5. Update product record with the new image URL
      console.log(
        `      -> Updating product record ${productId} with imageUrl...`
      );
      const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data: { imageUrl },
      });
      console.log("      -> Updated product:", updatedProduct);

      updatedProducts.push(updatedProduct);
      console.log(`   -> Finished processing product with ID: ${productId}\n`);
    }

    console.log("==> [generateProductImages] Finished successfully.");
    return res.status(200).json({
      success: true,
      data: updatedProducts,
    });
  } catch (error) {
    console.error("Error generating product images:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  generateProducts,
  generateProductImages,
};
