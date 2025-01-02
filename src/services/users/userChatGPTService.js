// src/services/userChatGPTService.js

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
 * 2. getJsonFromChatGPT:
 *    Performs a single non-streaming chat completion request,
 *    returning an array after parsing & fix-ups.
 */
async function getJsonFromChatGPT(model, messages, maxTokens = 10000) {
  // 1) Make a normal (non-stream) request
  const response = await openai.createChatCompletion({
    model,
    messages,
    max_tokens: maxTokens,
    // NOTE: no 'stream: true' here
  });

  // 2) The entire JSON output should be in content
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

  // 6) Additional pass: remove or fix malformed objects
  const finalArray = fixMalformedObjects(parsed);

  if (!finalArray.length) {
    throw new Error(
      "All objects were malformed and removed. Possibly a severe JSON error."
    );
  }

  return finalArray;
}

/** Helper: remove triple-backtick code fences */
function removeCodeFences(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();
}

/** Helper: try removing partial trailing objects at the end */
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
 * fixMalformedObjects:
 * - Ensures each object has these keys:
 *   firstName, lastName, username, email, password, role, moneyNum, favoriteProduct, prompt
 * - If missing or invalid, discard.
 */
function fixMalformedObjects(array) {
  const REQUIRED_KEYS = [
    "firstName",
    "lastName",
    "username",
    "email",
    "password",
    "role",
    "moneyNum",
    "favoriteProduct",
    "prompt",
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
        console.warn(`Discarding item missing key "${key}". Item:`, item);
        hasAllKeys = false;
        break;
      }
    }
    if (!hasAllKeys) continue;

    // Additional checks
    if (!isNonEmptyString(item.firstName)) {
      console.warn("Discarding user with invalid firstName:", item.firstName);
      continue;
    }
    if (!isNonEmptyString(item.lastName)) {
      console.warn("Discarding user with invalid lastName:", item.lastName);
      continue;
    }
    if (!isNonEmptyString(item.username)) {
      console.warn("Discarding user with invalid username:", item.username);
      continue;
    }
    if (!isNonEmptyString(item.email) || !item.email.includes("@")) {
      console.warn("Discarding user with invalid email:", item.email);
      continue;
    }
    if (!isNonEmptyString(item.password) || item.password.length < 4) {
      console.warn("Discarding user with invalid password:", item.password);
      continue;
    }

    // role must be 'USER' or 'ADMIN'
    const validRoles = ["USER", "ADMIN"];
    if (!validRoles.includes(item.role)) {
      console.warn(`Item role must be one of ${validRoles}. Found:`, item.role);
      continue;
    }

    // moneyNum must be a number
    if (typeof item.moneyNum !== "number") {
      console.warn("Discarding user with invalid moneyNum:", item.moneyNum);
      continue;
    }

    // favoriteProduct
    if (typeof item.favoriteProduct !== "string") {
      console.warn(
        "favoriteProduct is not a string, converting to empty string."
      );
      item.favoriteProduct = "";
    }

    // prompt can be any string
    if (typeof item.prompt !== "string") {
      console.warn("prompt is not a string, setting to empty string.");
      item.prompt = "";
    }

    validItems.push(item);
  }

  return validItems;
}

function isNonEmptyString(str) {
  return typeof str === "string" && str.trim().length > 0;
}

/**
 * 3. getUserChunk:
 *    Requests a valid JSON array of user objects from ChatGPT, for `count` users.
 */
async function getUserChunk(count) {
  console.log("Starting getUserChunk... Count:", count);

  const systemPrompt = `
You are an AI that ONLY outputs valid JSON arrays of user data.
No extra text, no code blocks, no partial objects, no trailing commas.
Each user must have exactly these keys:
  "firstName", "lastName", "username", "email", "password", "role", "moneyNum", "favoriteProduct", "prompt"

Rules:
1. Every user must have valid strings. For lastName and email, do not leave them empty or create blank keys like "".
2. If you cannot generate a specific field, fill it with a placeholder string like "Unknown".
3. Do not produce partial objects. If an item is incomplete, skip it or correct it, but the final output must remain a valid JSON array.
4. "prompt" must be at least 15 words describing the user’s personal facial details and style.
5. Double-check your JSON syntax thoroughly. Use proper quotes and colons.
6. End with a valid JSON array. Do not produce any trailing commas or extra text.
7. **All usernames must be UNIQUE**. If you generate any duplicates, replace or alter them so each user has a unique username.
8. **All emails must be UNIQUE**. If you generate any duplicates, modify them with random suffixes.
`;

  const userPrompt = `
Generate ${count} unique fictional users in a valid JSON array. Example of 1 item:

{
  "firstName": "Alice",
  "lastName": "Johnson",
  "username": "alice123",
  "email": "alice@example.com",
  "password": "Passw0rd!",
  "role": "USER",
  "moneyNum": 250.75,
  "favoriteProduct": "Fancy Laptop Case",
  "prompt": "Brown hair, green eyes, wears glasses, and has a friendly smile and modern style with floral tones."
}

No code blocks or markdown. Return only a valid JSON array with ${count} such objects.
`;

  // Instead of streaming, we do a single-step getJsonFromChatGPT
  const chunkArray = await getJsonFromChatGPT(
    "gpt-4o-mini-2024-07-18",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    10000
  );

  console.log("Received user chunk array of length:", chunkArray.length);
  return chunkArray;
}

/**
 * 4. We'll keep the same chunk-based approach with getUserChunkWithRetry, etc.
 */
function isTransientError(error) {
  const codes = ["ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "ECONNABORTED"];
  return codes.includes(error.code);
}

async function getUserChunkWithRetry(
  count,
  maxRetries = 5,
  baseDelayMs = 5000
) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await getUserChunk(count);
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
 * 5. The main function to generate multiple user data in chunks,
 *    calling onChunkReceived for partial insertion.
 */
async function generateMultipleUserDataWithCallback(
  totalNumberOfUsers,
  chunkSize = 10,
  onChunkReceived
) {
  console.log("Starting generateMultipleUserDataWithCallback for users...");
  console.log("Total users:", totalNumberOfUsers, "Chunk size:", chunkSize);

  let remaining = totalNumberOfUsers;
  const requestDelayMs = 8000; // 8 seconds between each chunk

  while (remaining > 0) {
    const batchSize = Math.min(remaining, chunkSize);
    console.log(
      `Requesting user chunk of size: ${batchSize} (remaining: ${remaining})`
    );

    // Attempt the chunk with retries on transient network errors
    const chunk = await getUserChunkWithRetry(batchSize, 5, 5000);
    console.log("   -> chunk length after fix:", chunk.length);

    // Let the callback handle partial saving
    await onChunkReceived(chunk);

    remaining -= batchSize;

    if (remaining > 0) {
      console.log(
        `   -> Waiting ${requestDelayMs}ms before next user chunk...`
      );
      await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    }
  }

  console.log("Finished generateMultipleUserDataWithCallback for users.");
}

/**
 * 6. A convenience function to get all user data at once (not chunked).
 */
async function generateMultipleUserData(
  totalNumberOfUsers = 50,
  chunkSize = 10
) {
  const finalUsers = [];
  await generateMultipleUserDataWithCallback(
    totalNumberOfUsers,
    chunkSize,
    async (chunk) => {
      finalUsers.push(...chunk);
    }
  );
  return finalUsers;
}

module.exports = {
  generateMultipleUserData,
  generateMultipleUserDataWithCallback,
};
