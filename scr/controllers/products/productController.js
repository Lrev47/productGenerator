// src/controllers/productController.js

const prisma = require("../../db/prisma/client");
const {
  generateMultipleProductDataWithCallback,
} = require("../../services/products/productChatGPTService");

/**
 * STEP 1: Generate multiple products and store them using Prisma,
 *         with partial saving if an error occurs.
 */
async function generateProducts(req, res) {
  console.log("==> [generateProducts] Function called.");

  try {
    let { numberOfProducts } = req.body;
    console.log(
      "   -> numberOfProducts (from request body):",
      numberOfProducts
    );

    // If user didn't provide, default to 500 (your requested default).
    if (!numberOfProducts || typeof numberOfProducts !== "number") {
      numberOfProducts = 100;
      console.warn(
        "   -> Using default of 100 products because none was provided."
      );
    }

    console.log(
      "   -> Generating multiple product data via ChatGPT (gpt-4)..."
    );

    // We'll keep track of all inserted products in case we want to return them,
    // but partial inserts happen as soon as each chunk arrives.
    const insertedProducts = [];

    // A callback that will be triggered each time we get a chunk of N items
    async function onChunkReceived(chunk) {
      console.log(
        `   -> [onChunkReceived] Chunk has ${chunk.length} items. Saving...`
      );

      // Insert each generated product into the database via Prisma
      for (const productData of chunk) {
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
    }

    // Generate data in chunks, passing our callback
    await generateMultipleProductDataWithCallback(
      numberOfProducts,
      20,
      onChunkReceived
    );

    console.log("==> [generateProducts] Finished successfully.");
    return res.status(200).json({
      success: true,
      data: insertedProducts,
    });
  } catch (error) {
    console.error("Error generating products:", error);

    return res.status(500).json({
      error: "Internal server error occurred during product generation.",
      partialInsertedCount: (error && error.insertedProductsLength) || 0,
      partialData: [],
      message:
        "Some products may have been inserted before the error. Check logs for details.",
    });
  }
}

module.exports = {
  generateProducts,
};
