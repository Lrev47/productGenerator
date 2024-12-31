// src/services/productS3Service.js

const AWS = require("aws-sdk");
const { awsConfig, s3BucketName } = require("../../config");

// Configure AWS
AWS.config.update(awsConfig);
// e.g. awsConfig = { region: "us-east-1", accessKeyId, secretAccessKey }

const s3 = new AWS.S3();

/**
 * Uploads a base64 string as a PNG to S3, returns the public URL.
 * Specifically used for product images.
 */
async function uploadImageToS3(base64Data, fileNamePrefix = "generated") {
  try {
    console.log("Starting uploadImageToS3 (product images)");

    console.log("Step 1: Converting base64 to buffer...");
    const imageBuffer = Buffer.from(base64Data, "base64");

    console.log("Step 2: Creating unique file name...");
    const timestamp = Date.now();
    const fileName = `images/${fileNamePrefix}_${timestamp}.png`;
    console.log(`Generated file name: ${fileName}`);

    const params = {
      Bucket: s3BucketName,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
    };
    console.log("S3 upload params:", params);

    console.log("Step 3: Uploading to S3...");
    const result = await s3.putObject(params).promise();
    console.log("S3 putObject result:", result);

    console.log("Step 4: Constructing image URL...");
    const imageUrl = `https://${s3BucketName}.s3.amazonaws.com/${fileName}`;
    console.log(`Image URL: ${imageUrl}`);

    console.log("Finished uploadImageToS3 for product images");
    return imageUrl;
  } catch (error) {
    console.error("Error uploading image to S3:", error);
    throw error;
  }
}

module.exports = {
  uploadImageToS3,
};
