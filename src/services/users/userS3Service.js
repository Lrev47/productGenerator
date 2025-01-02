// src/services/userS3Service.js

const AWS = require("aws-sdk");
const { awsConfig, s3BucketName } = require("../../config");

// Configure AWS
AWS.config.update(awsConfig);
// e.g. awsConfig = { region: "us-east-1", accessKeyId, secretAccessKey }

const s3 = new AWS.S3();

/**
 * Uploads a base64 string as a PNG to S3, returns the public URL.
 * Specifically used for user portrait images.
 */
async function uploadUserImageToS3(base64Data, fileNamePrefix = "user") {
  try {
    console.log("Starting uploadUserImageToS3...(user images)");

    // Convert base64 string to a Buffer
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Create a unique file name
    const timestamp = Date.now();
    const fileName = `user_images/${fileNamePrefix}_${timestamp}.png`;
    console.log(`Generated file name for user image: ${fileName}`);

    const params = {
      Bucket: s3BucketName,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
    };

    console.log("S3 upload params for user:", params);

    // Upload to S3
    const result = await s3.putObject(params).promise();
    console.log("S3 putObject result for user:", result);

    // Construct the public URL (assuming your bucket is public or you handle ACL)
    const imageUrl = `https://${s3BucketName}.s3.amazonaws.com/${fileName}`;
    console.log(`User image URL: ${imageUrl}`);

    console.log("Finished uploadUserImageToS3");
    return imageUrl;
  } catch (error) {
    console.error("Error uploading user image to S3:", error);
    throw error;
  }
}

module.exports = {
  uploadUserImageToS3,
};
