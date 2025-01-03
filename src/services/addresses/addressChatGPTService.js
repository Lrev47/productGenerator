// src/services/addresses/addressChatGPTService.js

const { Configuration, OpenAIApi } = require("openai");
const { openAiApiKey } = require("../../config");
const { jsonrepair } = require("jsonrepair");

// 1. Configure OpenAI
const configuration = new Configuration({
  apiKey: openAiApiKey,
});
const openai = new OpenAIApi(configuration);

/**
 * getJsonFromChatGPT:
 * Performs a single, non-streaming chat completion request, returning
 * an array of addresses after parsing & fix-ups.
 */
async function getJsonFromChatGPT(model, messages, maxTokens = 3000) {
  const response = await openai.createChatCompletion({
    model,
    messages,
    max_tokens: maxTokens,
    // no stream here
  });

  let content = response.data.choices?.[0]?.message?.content || "";

  content = removeCodeFences(content);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err1) {
    console.warn(
      "Direct parse of ChatGPT JSON failed. Attempting jsonrepair..."
    );
    try {
      const repaired = jsonrepair(content);
      parsed = JSON.parse(repaired);
    } catch (err2) {
      throw new Error(
        `Failed to parse JSON from ChatGPT: ${err2}\nRaw: ${content}`
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "ChatGPT output is not a JSON array. Check your prompt logic."
    );
  }

  const finalArray = fixMalformedObjects(parsed);
  if (!finalArray.length) {
    throw new Error("All address objects were malformed.");
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

/** fixMalformedObjects for addresses */
function fixMalformedObjects(array) {
  const REQUIRED_KEYS = [
    "label",
    "address1",
    "address2",
    "city",
    "state",
    "zipcode",
    "country",
  ];

  const validItems = [];
  for (const item of array) {
    if (typeof item !== "object" || Array.isArray(item) || !item) {
      console.warn("Discarding non-object item:", item);
      continue;
    }

    let hasAllKeys = true;
    for (const key of REQUIRED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) {
        console.warn(`Discarding item missing key "${key}":`, item);
        hasAllKeys = false;
        break;
      }
    }
    if (!hasAllKeys) continue;

    // Additional checks
    if (!isNonEmptyString(item.address1)) continue;
    if (!isNonEmptyString(item.city)) continue;
    if (!isNonEmptyString(item.zipcode)) continue;
    if (!isNonEmptyString(item.country)) continue;

    // label, address2, state can be optional or default
    if (!isNonEmptyString(item.label)) {
      item.label = "Home";
    }
    if (!isNonEmptyString(item.address2)) {
      item.address2 = "";
    }
    if (!isNonEmptyString(item.state)) {
      item.state = "";
    }

    validItems.push(item);
  }

  return validItems;
}

function isNonEmptyString(str) {
  return typeof str === "string" && str.trim().length > 0;
}

/**
 * getAddressChunk:
 * Requests a valid JSON array of address objects from ChatGPT for `count` addresses.
 */
async function getAddressChunk(count) {
  console.log("Starting getAddressChunk... Count:", count);

  const systemPrompt = `
You are an AI that ONLY outputs valid JSON arrays of address data.
No extra text, code blocks, partial objects, or trailing commas.
Each address must have these keys:
  "label", "address1", "address2", "city", "state", "zipcode", "country"

Rules:
1. If you cannot fill a key, set it to an empty string.
2. "label" can be something like "Home", "Work", "Billing", etc.
3. "address1" is the main street address, "address2" is apt/suite (may be empty).
4. "country" is mandatory (e.g. "USA"). 
5. Double-check your JSON syntax thoroughly. Use proper quotes/colons.
6. Return only a valid JSON array with no extra text.
`;

  const userPrompt = `
Generate ${count} fictional addresses in a valid JSON array. Example of 1 item:

{
  "label": "Home",
  "address1": "123 Main St",
  "address2": "Apt 4B",
  "city": "Springfield",
  "state": "IL",
  "zipcode": "62704",
  "country": "USA"
}

Return only the JSON array with ${count} such objects.
`;

  const chunkArray = await getJsonFromChatGPT(
    "gpt-4o-mini-2024-07-18",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    3000
  );

  console.log("Received address chunk of length:", chunkArray.length);
  return chunkArray;
}

/** Transient error check for network errors. */
function isTransientError(error) {
  const codes = ["ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "ECONNABORTED"];
  return codes.includes(error.code);
}

/**
 * getAddressChunkWithRetry:
 * Repeats the getAddressChunk call up to 5 times if transient errors occur.
 */
async function getAddressChunkWithRetry(
  count,
  maxRetries = 5,
  baseDelayMs = 5000
) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await getAddressChunk(count);
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
 * generateMultipleAddressDataWithCallback:
 *  - Repeatedly fetch addresses from ChatGPT in sets of `chunkSize`.
 *  - Yields each chunk to the callback for partial saving or accumulation.
 */
async function generateMultipleAddressDataWithCallback(
  totalNumberOfAddresses,
  chunkSize,
  onChunkReceived
) {
  console.log("Starting generateMultipleAddressDataWithCallback...");
  console.log(
    "Total addresses:",
    totalNumberOfAddresses,
    "Chunk size:",
    chunkSize
  );

  let remaining = totalNumberOfAddresses;
  const requestDelayMs = 8000; // 8 seconds between chunks

  while (remaining > 0) {
    const batchSize = Math.min(remaining, chunkSize);
    console.log(
      `Requesting address chunk of size: ${batchSize} (remaining: ${remaining})`
    );

    const chunk = await getAddressChunkWithRetry(batchSize, 5, 5000);
    console.log("   -> chunk length after fix:", chunk.length);

    // onChunkReceived for partial saving or accumulation
    await onChunkReceived(chunk);

    remaining -= batchSize;

    if (remaining > 0) {
      console.log(`   -> Waiting ${requestDelayMs}ms before next chunk...`);
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    }
  }

  console.log("Finished generateMultipleAddressDataWithCallback.");
}

module.exports = {
  generateMultipleAddressDataWithCallback,
  // ... other exports if needed
};
