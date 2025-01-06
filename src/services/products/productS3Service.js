const AWS = require("aws-sdk");
const { awsConfig, s3BucketName } = require("../../config");

// Configure AWS
AWS.config.update(awsConfig);
// e.g. awsConfig = { region: "us-east-1", accessKeyId: "...", secretAccessKey: "..." }

const s3 = new AWS.S3();

/**
 * Uploads a base64 string as a PNG to S3, returns the public URL.
 * Specifically used for product images.
 */
async function uploadProductImageToS3(base64Data, fileNamePrefix = "product") {
  try {
    console.log("Starting uploadProductImageToS3... (product images)");

    // 1) Convert base64 to Buffer
    const imageBuffer = Buffer.from(base64Data, "base64");

    // 2) Create a unique file name
    const timestamp = Date.now();
    const fileName = `product_images/${fileNamePrefix}_${timestamp}.png`;
    console.log(`Generated file name for product image: ${fileName}`);

    // 3) S3 upload params
    const params = {
      Bucket: s3BucketName,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
    };
    console.log("S3 upload params for product:", params);

    // 4) Upload to S3
    const result = await s3.putObject(params).promise();
    console.log("S3 putObject result for product:", result);

    // 5) Construct public URL (assuming your bucket is public or you set ACL)
    const imageUrl = `https://${s3BucketName}.s3.amazonaws.com/${fileName}`;
    console.log(`product image URL: ${imageUrl}`);

    console.log("Finished uploadProductImageToS3");
    return imageUrl;
  } catch (error) {
    console.error("Error uploading product image to S3:", error);
    throw error;
  }
}

module.exports = {
  uploadProductImageToS3,
};
