// scr/services/s3Service.js
const AWS = require("aws-sdk");
const { awsConfig, s3BucketName } = require("../config");

// Configure AWS
AWS.config.update(awsConfig);
// e.g. awsConfig = { region: "us-east-1", accessKeyId, secretAccessKey }

const s3 = new AWS.S3();

/**
 * Uploads a base64 string as a PNG to S3, returns the public URL.
 */
async function uploadImageToS3(base64Data, fileNamePrefix = "generated") {
  try {
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Unique file name
    const timestamp = Date.now();
    const fileName = `images/${fileNamePrefix}_${timestamp}.png`;

    const params = {
      Bucket: s3BucketName,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
    };

    // Upload the image
    await s3.putObject(params).promise();

    // Construct the public URL (assuming your bucket is public or you have a CloudFront distro)
    const imageUrl = `https://${s3BucketName}.s3.amazonaws.com/${fileName}`;

    return imageUrl;
  } catch (error) {
    console.error("Error uploading image to S3:", error);
    throw error;
  }
}

module.exports = {
  uploadImageToS3,
};
