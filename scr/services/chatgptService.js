// scr/services/chatgptService.js

const { Configuration, OpenAIApi } = require("openai");
const { openAiApiKey } = require("../config");

// 1. Configure OpenAI
const configuration = new Configuration({
  apiKey: openAiApiKey,
});
const openai = new OpenAIApi(configuration);

/**
 * Single-product prompt generator (detailed marketing copy).
 */
async function generateProductDescriptionPrompt(productDetails) {
  try {
    const completion = await openai.createChatCompletion({
      // Change model if "gpt-4o-mini" is not valid for your account
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI that generates marketing-friendly product descriptions. Provide a short, persuasive product blurb.",
        },
        {
          role: "user",
          content: `Generate a concise yet compelling product description for: ${productDetails}`,
        },
      ],
      max_tokens: 200,
    });

    return completion.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error in generateProductDescriptionPrompt:", error);
    throw error;
  }
}

/**
 * Helper function: fetch a single chunk of product data (count products).
 */
async function getProductChunk(count) {
  // This is your single-chunk system prompt
  const systemPrompt = `
    You are an AI that generates eCommerce product data in JSON format.
    Each product must have:
    - name (string)
    - category (string)
    - price (float)
    - rating (float, 0-5)
    - quantity (integer)
    - description (string) (LONGER marketing copy)
    - prompt (string) (A VISUAL prompt describing the product for an AI image generator)

    Return ONLY valid JSON array, no extra text, no code fences.
  `;

  // This is your single-chunk user prompt
  const userPrompt = `
    Generate ${count} unique, high-quality products:
    - name, category, price, rating, quantity
    - description (2-3 sentences, interesting detail)
    - prompt (appearance/style for an image generator)

    Return only a valid JSON array with ${count} objects. 
    No extra text, no markdown fences.
  `;

  // Adjust model & tokens as needed
  const completion = await openai.createChatCompletion({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 2000, // enough for ~10 items
  });

  let rawOutput = completion.data.choices[0].message.content.trim();

  // Strip code fences
  rawOutput = rawOutput.replace(/```[\s\S]*?```/g, "").replace(/```/g, "");

  const chunkArray = JSON.parse(rawOutput);
  if (!Array.isArray(chunkArray)) {
    throw new Error(
      "ChatGPT chunk output is not an array. Check your prompt logic."
    );
  }

  return chunkArray;
}

/**
 * Generate multiple product data items by chunking in smaller batches.
 * - totalNumberOfProducts: total items you want
 * - chunkSize: how many items per chunk
 */
async function generateMultipleProductData(
  totalNumberOfProducts,
  chunkSize = 10
) {
  try {
    const finalProducts = [];
    let remaining = totalNumberOfProducts;

    // Repeatedly fetch chunks until we have 'totalNumberOfProducts'
    while (remaining > 0) {
      const batchSize = Math.min(remaining, chunkSize);
      const chunk = await getProductChunk(batchSize);

      finalProducts.push(...chunk);
      remaining -= batchSize;
    }

    return finalProducts;
  } catch (error) {
    console.error("Error in generateMultipleProductData:", error);
    throw error;
  }
}

module.exports = {
  generateProductDescriptionPrompt,
  generateMultipleProductData,
};
