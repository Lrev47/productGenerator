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
  try {
    const { numberOfProducts } = req.body;

    if (!numberOfProducts || typeof numberOfProducts !== "number") {
      return res
        .status(400)
        .json({ error: "Please provide a valid numberOfProducts (number)." });
    }

    // 1. Use ChatGPT to generate an array of product data
    const productDataArray = await generateMultipleProductData(
      numberOfProducts
    );

    // 2. Insert each generated product into the database via Prisma
    const insertedProducts = [];
    for (const productData of productDataArray) {
      const { name, category, price, rating, description, prompt, quantity } =
        productData;

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

      insertedProducts.push(newProduct);
    }

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
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds)) {
      return res
        .status(400)
        .json({ error: "Please provide an array of productIds." });
    }

    const updatedProducts = [];

    // For each productId, fetch/update using Prisma
    for (const productId of productIds) {
      // 1. Get product from DB
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        console.warn(`Product with id ${productId} not found.`);
        continue;
      }

      // If there's already an imageUrl, skip or decide if you want to regenerate
      if (product.imageUrl) {
        console.log(`Product ${productId} already has an image. Skipping...`);
        updatedProducts.push(product);
        continue;
      }

      // 2. If there's no prompt, generate it from the product's description
      let prompt = product.prompt;
      if (!prompt) {
        prompt = await generateProductDescriptionPrompt(product.description);
      }

      // 3. Generate image with ComfyUI
      const imageBuffer = await generateImageFromPrompt(prompt);

      // 4. Upload image to AWS S3
      const imageUrl = await uploadImageToS3(imageBuffer, prompt);

      // 5. Update product record with the new image URL
      const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data: { imageUrl },
      });

      updatedProducts.push(updatedProduct);
    }

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
