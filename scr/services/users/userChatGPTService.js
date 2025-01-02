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
 * 2. Streams the ChatGPT response, collects full text, strips code fences,
 *    attempts to fix partial/truncated JSON with 'jsonrepair',
 *    then parses into an array. Finally, do a deeper "fixMalformedObjects" pass
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

      // Additional pass: remove or fix malformed objects
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

/** 2a) Helper: remove triple-backtick code fences */
function removeCodeFences(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();
}

/** 2b) Helper: try removing partial trailing objects at the end */
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
 * 2c) fixMalformedObjects:
 *     - Ensures each object has the keys matching your User model:
 *       firstName, lastName, username, email, password, role, moneyNum, favoriteProduct, prompt
 *     - If an object is missing keys or has obviously broken data, we discard or try to fix it.
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

    // Check if it has all required keys
    let hasAllKeys = true;
    for (const key of REQUIRED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) {
        console.warn(`Discarding item missing key "${key}". Item:`, item);
        hasAllKeys = false;
        break;
      }
    }
    if (!hasAllKeys) continue;

    // Additional sanity checks
    if (typeof item.firstName !== "string" || !item.firstName.trim()) {
      console.warn("Discarding user with invalid firstName:", item.firstName);
      continue;
    }
    if (typeof item.lastName !== "string" || !item.lastName.trim()) {
      console.warn("Discarding user with invalid lastName:", item.lastName);
      continue;
    }
    if (typeof item.username !== "string" || !item.username.trim()) {
      console.warn("Discarding user with invalid username:", item.username);
      continue;
    }
    if (typeof item.email !== "string" || !item.email.includes("@")) {
      console.warn("Discarding user with invalid email:", item.email);
      continue;
    }
    if (typeof item.password !== "string" || item.password.length < 4) {
      console.warn("Discarding user with invalid password:", item.password);
      continue;
    }

    // For role, ensure it's either 'USER' or 'ADMIN' (as per your enum)
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

    // favoriteProduct can be a string or empty
    if (typeof item.favoriteProduct !== "string") {
      console.warn(
        "favoriteProduct is not a string, converting to an empty string."
      );
      item.favoriteProduct = "";
    }

    // prompt can be any string
    if (typeof item.prompt !== "string") {
      console.warn("prompt is not a string, setting to empty string.");
      item.prompt = "";
    }

    // If we reach here, the user item is good enough
    validItems.push(item);
  }

  return validItems;
}

/**
 * 3. Get a chunk of user data from ChatGPT. We request a valid JSON array
 *    of user objects with strictly the required fields.
 */
async function getUserChunk(count) {
  console.log("Starting getUserChunk... Count:", count);

  const systemPrompt = `
You are an AI that ONLY outputs valid JSON arrays of user data for a fictional eCommerce platform.
No extra text, no code blocks, no partial objects, no trailing commas.
Each user object must have exactly these keys:
  "firstName", "lastName", "username", "email", "password", "role", "moneyNum", "favoriteProduct", "prompt"

Constraints:
 - role must be either "USER" or "ADMIN" (randomly choose).
 - moneyNum can be a floating number (like 123.45 or 0.0).
 - prompt should be at least 10 words describing the user’s personal facial details and style.
Double-check your JSON syntax thoroughly. Use proper quotes and colons.
If your response is cut off, end with a valid JSON array anyway if possible.
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

  // Using "gpt-4o-mini" per your request
  const chunkArray = await streamAndParseJson(
    "gpt-4o-mini",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    3000
  );

  console.log("Received user chunk array of length:", chunkArray.length);
  return chunkArray;
}

/**
 * Retries getUserChunk on transient errors with exponential backoff, up to 5 attempts.
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
 * 4. The function that yields each chunk to a callback for partial saving.
 *    Default chunkSize is set to 10 if not specified.
 */
async function generateMultipleUserDataWithCallback(
  totalNumberOfUsers,
  chunkSize = 10,
  onChunkReceived
) {
  console.log("Starting generateMultipleUserDataWithCallback for users...");
  console.log("Total users:", totalNumberOfUsers, "Chunk size:", chunkSize);

  let remaining = totalNumberOfUsers;
  const requestDelayMs = 8000; // 8 seconds between chunks

  while (remaining > 0) {
    const batchSize = Math.min(remaining, chunkSize);
    console.log(
      `Requesting user chunk of size: ${batchSize} (remaining: ${remaining})`
    );

    // Attempt to get chunk with retry
    const chunk = await getUserChunkWithRetry(batchSize, 5, 5000);
    console.log("   -> chunk length after fix:", chunk.length);

    // Call the callback to handle partial saving
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
 * For convenience, if you want a single function that just returns
 * the entire user array in memory (not chunked), do:
 */
async function generateMultipleUserData(
  totalNumberOfUsers = 100,
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
