// scr/services/productChatGPTService.js

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
 */
async function generateProductDescriptionPrompt(productDetails) {
  try {
    console.log("Starting generateProductDescriptionPrompt...");
    console.log("Product details:", productDetails);

    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini",
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
      max_tokens: 3000,
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
 * 3. Streams the ChatGPT response, collects full text, strips code fences,
 *    attempts to fix partial/truncated JSON with 'jsonrepair',
 *    then parses into an array. Finally, do a deeper "fixObjectKeys" pass
 *    on each item if needed.
 */
async function streamAndParseJson(model, messages, maxTokens = 3000) {
  const response = await openai.createChatCompletion(
    {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
    },
    { responseType: "stream" }
  );

  let fullText = "";
  const stream = response.data;

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const jsonPayload = trimmed.replace(/^data: /, "");
        if (jsonPayload === "[DONE]") {
          return; // End of stream
        }

        try {
          const parsed = JSON.parse(jsonPayload);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
          }
        } catch {
          // Possibly partial lines or [DONE]
        }
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });

    stream.on("end", () => {
      // 1) Remove code fences
      let cleaned = removeCodeFences(fullText);
      // 2) Try to remove partial trailing objects
      cleaned = tryRemoveTrailingPartialObject(cleaned);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr1) {
        console.warn(
          "Direct parse of ChatGPT JSON failed. Attempting jsonrepair..."
        );
        try {
          const repaired = jsonrepair(cleaned);
          parsed = JSON.parse(repaired);
        } catch (parseErr2) {
          return reject(
            new Error(
              `Failed to parse JSON from ChatGPT: ${parseErr2}\nRaw: ${cleaned}`
            )
          );
        }
      }

      if (!Array.isArray(parsed)) {
        return reject(
          new Error("ChatGPT output is not an array. Check your prompt logic.")
        );
      }

      // Additional pass: fix or remove items with missing keys or glaring issues
      const finalArray = fixMalformedObjects(parsed);

      if (!finalArray.length) {
        return reject(
          new Error(
            "All objects were malformed and removed. Possibly a severe JSON error."
          )
        );
      }

      resolve(finalArray);
    });
  });
}

/** 3a) Helper: remove triple-backtick code fences */
function removeCodeFences(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();
}

/** 3b) Helper: try removing partial trailing objects at the end */
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
 *     - Ensures each object has exactly the 7 keys: name, category, price, rating, quantity, description, prompt
 *     - If an object is missing keys or has obviously broken data, we discard or try to fix it.
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

  // We'll store only valid items here
  const validItems = [];

  for (const item of array) {
    if (typeof item !== "object" || Array.isArray(item) || !item) {
      console.warn("Discarding non-object item:", item);
      continue;
    }

    // Check if it has all required keys
    let hasAllKeys = true;
    for (const k of REQUIRED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(item, k)) {
        console.warn(
          `Discarding item missing key "${k}". Item:`,
          JSON.stringify(item)
        );
        hasAllKeys = false;
        break;
      }
    }

    if (!hasAllKeys) continue;

    // Additional sanity checks: e.g., price must be a number
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

    // If we reach here, the item is good enough
    validItems.push(item);
  }

  return validItems;
}

/**
 * 4. Low-level function to fetch 'count' items (chunk) from GPT-4, returning an array.
 *    We ask for a longer description & prompt, careful about syntax.
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

  const chunkArray = await streamAndParseJson(
    "gpt-4",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    3000
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
 * 5. The new function that yields each chunk to a callback for partial saving, if desired.
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

    // Call the user-provided callback to handle partial saving
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
 * For convenience, if you still want a single function that just returns
 * the entire array in memory, do:
 */
async function generateMultipleProductData(
  totalNumberOfProducts,
  chunkSize = 20
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
