// scr/services/chatgptService.js

const { Configuration, OpenAIApi } = require("openai");
const { openAiApiKey } = require("../config");
const { PassThrough } = require("stream");
const { jsonrepair } = require("jsonrepair");

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
    console.log("Starting generateProductDescriptionPrompt...");
    console.log("Product details:", productDetails);

    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini-2024-07-18", // from your docs
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
      max_tokens: 1024,
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
 * Streams the ChatGPT response and collects all text. Then:
 *  - Removes code fences
 *  - Attempts to parse as JSON
 *  - If that fails, tries 'jsonrepair' to fix small errors
 */
async function streamAndParseJson(model, messages, maxTokens = 1024) {
  // Stream the ChatGPT response
  const completion = await openai.createChatCompletion(
    {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
    },
    {
      responseType: "stream", // So we get a streaming response
    }
  );

  let fullResponse = "";
  const stream = completion.data;

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonPart = trimmed.replace(/^data: /, "");
        if (jsonPart === "[DONE]") {
          return; // End of stream
        }

        try {
          const parsed = JSON.parse(jsonPart);
          // Each chunk has shape: { choices: [ { delta: { content: "..."} } ] }
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
          }
        } catch {
          // Some lines might not be valid JSON (like "data: [DONE]")
        }
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });

    stream.on("end", () => {
      // All chunks received, now attempt to parse
      let cleaned = fullResponse
        // Remove code fences
        .replace(/```[\s\S]*?```/g, "")
        .replace(/```/g, "")
        .trim();

      // 1) Try direct parse
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr1) {
        // 2) Attempt to repair the JSON using `jsonrepair`
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
          new Error(
            "ChatGPT chunk output is not an array. Check your prompt logic."
          )
        );
      }

      resolve(parsed);
    });
  });
}

/**
 * Low-level function to get "count" products by streaming them from OpenAI.
 */
async function getProductChunk(count) {
  console.log("Starting getProductChunk... Count:", count);

  // Stronger prompt to force valid JSON
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
    If your response is incomplete, provide an easy way to fix it.
  `;

  const userPrompt = `
    Generate ${count} unique, high-quality products:
    - name, category, price, rating, quantity
    - description (2-3 sentences, interesting detail)
    - prompt (appearance/style for an image generator)
    Return only a valid JSON array with ${count} objects.
    No extra text or markdown fences.
  `;

  console.log("Sending getProductChunk prompt to OpenAI (streaming)...");
  const chunkArray = await streamAndParseJson(
    "gpt-4o-mini-2024-07-18",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    1024
  );

  console.log("Parsed chunk array length:", chunkArray.length);
  console.log("Finished getProductChunk.");
  return chunkArray;
}

/**
 * Retries getProductChunk on transient errors like ECONNRESET or ETIMEDOUT.
 */
async function getProductChunkWithRetry(
  count,
  maxRetries = 3,
  retryDelayMs = 2000
) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await getProductChunk(count);
    } catch (error) {
      if (
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ENETUNREACH" ||
        error.code === "ECONNABORTED"
      ) {
        attempts++;
        console.warn(
          `Transient error (${error.code}). Retrying attempt ${attempts}/${maxRetries}...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        throw error;
      }
    }
  }
  throw new Error(
    `Failed after ${maxRetries} retries due to repeated network errors.`
  );
}

/**
 * Generate multiple product data items by chunking in smaller batches.
 */
async function generateMultipleProductData(
  totalNumberOfProducts,
  chunkSize = 5
) {
  try {
    console.log("Starting generateMultipleProductData...");
    console.log("Total number of products:", totalNumberOfProducts);
    console.log("Chunk size:", chunkSize);

    const finalProducts = [];
    let remaining = totalNumberOfProducts;

    const requestDelayMs = 2000; // Wait 2 seconds between chunks

    while (remaining > 0) {
      const batchSize = Math.min(remaining, chunkSize);
      console.log(
        `Requesting chunk of size: ${batchSize} (remaining: ${remaining})`
      );

      // Get chunk with retry logic
      const chunk = await getProductChunkWithRetry(batchSize);
      console.log("Received chunk with length:", chunk.length);

      finalProducts.push(...chunk);
      remaining -= batchSize;

      if (remaining > 0) {
        console.log(`Waiting ${requestDelayMs}ms before next chunk...`);
        await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
      }
    }

    console.log("Final products array length:", finalProducts.length);
    console.log("Finished generateMultipleProductData.");
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
