// src/services/productChatGPTService.js

const { Configuration, OpenAIApi } = require("openai");
const { openAiApiKey } = require("../../config");
const { jsonrepair } = require("jsonrepair");

/**
 * 1. Configure OpenAI
 */
const configuration = new Configuration({
  apiKey: openAiApiKey,
});
const openai = new OpenAIApi(configuration);

/**
 * 2. Single-product prompt generator (detailed marketing copy).
 *    (No changes needed here.)
 */
async function generateProductDescriptionPrompt(productDetails) {
  try {
    console.log("Starting generateProductDescriptionPrompt...");
    console.log("Product details:", productDetails);

    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini-2024-07-18",
      messages: [
        {
          role: "system",
          content:
            "You are an AI that generates marketing-friendly product descriptions. Provide a short, persuasive product blurb. Be careful with JSON syntax if you show examples.",
        },
        {
          role: "user",
          content: `Generate a concise yet compelling product description for: ${productDetails}`,
        },
      ],
      max_tokens: 10000,
    });

    const result = completion.data.choices[0].message.content.trim();
    console.log("Prompt generation result:", result);

    console.log("Finished generateProductDescriptionPrompt.");
    return result;
  } catch (error) {
    console.error("Error in generateProductDescriptionPrompt:", error);
    throw error;
  }
}

/**
 * 3. Non-streaming approach to fetch the JSON from ChatGPT,
 *    then parse & fix it.
 */
async function getJsonFromChatGPT(model, messages, maxTokens = 10000) {
  // 1) Make a normal (non-stream) chat completion request
  const response = await openai.createChatCompletion({
    model,
    messages,
    max_tokens: maxTokens,
    // no stream: true here
  });

  // 2) The entire JSON is expected in content
  let content = response.data.choices?.[0]?.message?.content || "";

  // 3) Remove code fences
  content = removeCodeFences(content);

  // 4) Try removing partial trailing objects
  content = tryRemoveTrailingPartialObject(content);

  // 5) Attempt to parse JSON, fallback to jsonrepair
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseErr1) {
    console.warn(
      "Direct parse of ChatGPT JSON failed. Attempting jsonrepair..."
    );
    try {
      const repaired = jsonrepair(content);
      parsed = JSON.parse(repaired);
    } catch (parseErr2) {
      throw new Error(
        `Failed to parse JSON from ChatGPT: ${parseErr2}\nRaw: ${content}`
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("ChatGPT output is not an array. Check your prompt logic.");
  }

  // Additional pass: fix or remove items with missing keys or glaring issues
  const finalArray = fixMalformedObjects(parsed);

  if (!finalArray.length) {
    throw new Error(
      "All objects were malformed and removed. Possibly a severe JSON error."
    );
  }

  return finalArray;
}

/** Helper to remove triple-backtick code fences */
function removeCodeFences(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();
}

/** Helper to remove partial trailing objects if needed */
function tryRemoveTrailingPartialObject(text) {
  if (text.trim().endsWith("]")) return text;

  const lastBrace = text.lastIndexOf("}");
  if (lastBrace > 0) {
    text = text.slice(0, lastBrace + 1);
  }
  if (!text.trim().endsWith("]")) {
    text += "]";
  }
  return text;
}

/**
 * 3c) fixMalformedObjects:
 *     - Ensures each product object has: name, category, price, rating, quantity, description, prompt
 *     - If missing or invalid, we discard it.
 */
function fixMalformedObjects(array) {
  const REQUIRED_KEYS = [
    "name",
    "category",
    "price",
    "rating",
    "quantity",
    "description",
    "prompt",
  ];

  const validItems = [];

  for (const item of array) {
    if (typeof item !== "object" || Array.isArray(item) || !item) {
      console.warn("Discarding non-object item:", item);
      continue;
    }

    let hasAllKeys = true;
    for (const k of REQUIRED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(item, k)) {
        console.warn(`Discarding item missing key "${k}". Item:`, item);
        hasAllKeys = false;
        break;
      }
    }
    if (!hasAllKeys) continue;

    // Additional sanity checks
    if (typeof item.price !== "number") {
      console.warn("Discarding item with invalid price:", item.price);
      continue;
    }
    if (typeof item.rating !== "number") {
      console.warn("Discarding item with invalid rating:", item.rating);
      continue;
    }
    if (typeof item.quantity !== "number") {
      console.warn("Discarding item with invalid quantity:", item.quantity);
      continue;
    }

    // If we reach here, the item is valid enough
    validItems.push(item);
  }

  return validItems;
}

/**
 * 4. getProductChunk: fetch 'count' items from GPT, returning an array.
 */
async function getProductChunk(count) {
  console.log("Starting getProductChunk... Count:", count);

  // Tighter prompt to ensure correct structure & syntax
  const systemPrompt = `
You are an AI that ONLY outputs valid JSON arrays of eCommerce product data.
No extra text, no code blocks, no partial objects, no trailing commas.
Each product must have exactly these keys: name, category, price, rating, quantity, description, prompt

- "description": at least 3 sentences
- "prompt": at least 15 words describing the visual scenario

Double-check your JSON syntax thoroughly. Use proper quotes and colons.
If your response is cut off, end with a valid JSON array anyway if possible.
`;

  const userPrompt = `
Generate ${count} unique, high-quality products in a valid JSON array. Example of 1 item:

{
  "name": "Sample Product",
  "category": "Sample Category",
  "price": 12.99,
  "rating": 4.2,
  "quantity": 50,
  "description": "Sentence one. Sentence two. Sentence three. Provide enough detail.",
  "prompt": "Write at least 15 words describing the product's appearance, setting, or style."
}

Return only a valid JSON array with ${count} such objects. No code blocks or markdown.
`;

  // Use the new getJsonFromChatGPT method
  const chunkArray = await getJsonFromChatGPT(
    "gpt-4o-mini",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    10000
  );

  console.log("Received chunk array of length:", chunkArray.length);
  return chunkArray;
}

/**
 * Retries getProductChunk on transient errors with exponential backoff, up to 5 attempts.
 */
function isTransientError(error) {
  const codes = ["ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "ECONNABORTED"];
  return codes.includes(error.code);
}

async function getProductChunkWithRetry(
  count,
  maxRetries = 5,
  baseDelayMs = 5000
) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await getProductChunk(count);
    } catch (error) {
      if (isTransientError(error)) {
        attempts++;
        if (attempts < maxRetries) {
          const backoff = baseDelayMs * 2 ** (attempts - 1);
          console.warn(
            `Transient error (${error.code}). Retrying #${attempts}/${maxRetries} in ${backoff}ms...`
          );
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          throw new Error(
            `Failed after ${maxRetries} retries due to repeated network errors.`
          );
        }
      } else {
        throw error;
      }
    }
  }
}

/**
 * 5. The function that yields each chunk to a callback for partial saving.
 */
async function generateMultipleProductDataWithCallback(
  totalNumberOfProducts,
  chunkSize,
  onChunkReceived
) {
  console.log("Starting generateMultipleProductDataWithCallback...");
  console.log(
    "Total products:",
    totalNumberOfProducts,
    "Chunk size:",
    chunkSize
  );

  let remaining = totalNumberOfProducts;
  const requestDelayMs = 8000; // 8 seconds between chunks

  while (remaining > 0) {
    const batchSize = Math.min(remaining, chunkSize);
    console.log(
      `Requesting chunk of size: ${batchSize} (remaining: ${remaining})`
    );

    // Attempt to get chunk with retry
    const chunk = await getProductChunkWithRetry(batchSize, 5, 5000);
    console.log("   -> chunk length after fix:", chunk.length);

    // Call the user-provided callback
    await onChunkReceived(chunk);

    remaining -= batchSize;

    if (remaining > 0) {
      console.log(`   -> Waiting ${requestDelayMs}ms before next chunk...`);
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    }
  }

  console.log("Finished generateMultipleProductDataWithCallback.");
}

/**
 * 6. For convenience, a single function that just returns
 *    the entire array in memory.
 */
async function generateMultipleProductData(
  totalNumberOfProducts,
  chunkSize = 10
) {
  const finalProducts = [];
  await generateMultipleProductDataWithCallback(
    totalNumberOfProducts,
    chunkSize,
    async (chunk) => {
      finalProducts.push(...chunk);
    }
  );
  return finalProducts;
}

module.exports = {
  generateProductDescriptionPrompt,
  generateMultipleProductData,
  generateMultipleProductDataWithCallback,
};
