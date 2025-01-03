// src/services/reviews/reviewChatGPTService.js

const { Configuration, OpenAIApi } = require("openai");
const { jsonrepair } = require("jsonrepair");
const { openAiApiKey } = require("../../config");

const configuration = new Configuration({ apiKey: openAiApiKey });
const openai = new OpenAIApi(configuration);

/**
 * getReviewsForSingleUser:
 *  - We do ONE call for the user, with 5 product references,
 *    so each review comment references the product name/description.
 */
async function getReviewsForSingleUser(
  userId,
  pairs, // e.g. 5 items of { userId, productId, productName, productDescription }
  maxTokens = 6000
) {
  console.log(
    `getReviewsForSingleUser => user ${userId}, product count: ${pairs.length}`
  );

  const systemPrompt = `
You are an AI that ONLY outputs valid JSON arrays of 5 reviews.
No extra text, code blocks, or partial objects.
Each review object must have these keys: 
  "userId", "productId", "starRating", "comment".

Rules:
1. starRating is integer 1..5
2. comment references the "productName" or "productDescription" meaningfully (2-3 sentences).
3. userId, productId EXACTLY as given. 
4. Return only a valid JSON array of length ${pairs.length}. 
   No trailing commas or extra commentary.
`;

  // We'll build a userPrompt describing each product
  // So GPT can produce a comment referencing name or desc
  let userPrompt = `We have ${pairs.length} product reviews for userId = ${userId}.\n`;
  userPrompt += `For each item, produce:\n{\n  "userId": <same as input>,\n  "productId": <same as input>,\n  "starRating": <1..5>,\n  "comment": <short paragraph referencing productName or productDescription>\n}\n\nHere are the products:\n`;

  // We'll show GPT:
  //   e.g. "1) productId=14, productName='iPhone 13', productDescription='A fancy phone...'"
  pairs.forEach((p, i) => {
    userPrompt += `${i + 1}) productId=${p.productId}, productName="${
      p.productName
    }", productDescription="${p.productDescription}"\n`;
  });

  userPrompt += `
Return a valid JSON array with exactly ${pairs.length} objects, each matching the userId/productId from above.
`;

  // 1) Make the request
  const response = await openai.createChatCompletion({
    model: "gpt-4o-mini-2024-07-18", // or whichever
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: maxTokens,
  });

  // 2) Parse the content
  let content = response.data.choices?.[0]?.message?.content || "";
  content = removeCodeFences(content);

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err1) {
    console.warn("Direct parse failed, attempting jsonrepair...");
    try {
      const repaired = jsonrepair(content);
      parsed = JSON.parse(repaired);
    } catch (err2) {
      throw new Error(`Failed to parse JSON: ${err2}\nRaw: ${content}`);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "ChatGPT output is not a JSON array. Possibly missing or invalid format."
    );
  }

  // Validate shape
  const finalArray = fixMalformedReviews(parsed);
  console.log("   -> GPT returned reviews:", finalArray.length);
  return finalArray;
}

/** Simple fix/validation: each item has { userId, productId, starRating, comment } */
function fixMalformedReviews(array) {
  const required = ["userId", "productId", "starRating", "comment"];
  const valid = [];

  for (const item of array) {
    if (typeof item !== "object" || !item) continue;

    let hasAllKeys = true;
    for (const k of required) {
      if (!Object.prototype.hasOwnProperty.call(item, k)) {
        hasAllKeys = false;
        break;
      }
    }
    if (!hasAllKeys) continue;

    const sr = parseInt(item.starRating, 10);
    if (Number.isNaN(sr) || sr < 1 || sr > 5) continue;

    item.starRating = sr;
    item.userId = parseInt(item.userId, 10) || 0;
    item.productId = parseInt(item.productId, 10) || 0;
    if (item.userId <= 0 || item.productId <= 0) continue;

    if (typeof item.comment !== "string") {
      item.comment = "";
    }

    valid.push(item);
  }
  return valid;
}

/** Helper to remove triple-backtick code fences. */
function removeCodeFences(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/```/g, "")
    .trim();
}

module.exports = {
  getReviewsForSingleUser,
};
