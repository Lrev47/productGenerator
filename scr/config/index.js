// scr/config/index.js
require("dotenv").config(); // so it loads variables from .env

const openAiApiKey = process.env.OPENAI_API_KEY;
const comfyUIBaseUrl = process.env.COMFYUI_BASE_URL;
const dbConnectionString = process.env.DATABASE_URL;
const awsConfig = {
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const s3BucketName = process.env.S3_BUCKET_NAME;
const port = process.env.PORT || 3000;

module.exports = {
  openAiApiKey,
  comfyUIBaseUrl,
  dbConnectionString,
  awsConfig,
  s3BucketName,
  port,
};
