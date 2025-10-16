/**
 * ShareSafely - Secure File Sharing Application
 * 
 * This application allows users to upload files to Azure Blob Storage
 * and generates time-limited SAS (Shared Access Signature) URLs for secure sharing.
 * 
 * Security Features:
 * - Uses Managed Identity (no hardcoded credentials)
 * - Generates User Delegation SAS tokens (Azure AD-based, most secure)
 * - Time-limited access to uploaded files
 * - Proper error handling and logging
 * 
 * References:
 * - https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-upload-javascript
 * - https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-create-user-delegation-sas-javascript
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { DefaultAzureCredential } = require('@azure/identity');
const { 
    BlobServiceClient, 
    BlobSASPermissions, 
    generateBlobSASQueryParameters,
    SASProtocol 
} = require('@azure/storage-blob');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for in-memory file uploads (files < 100MB)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max file size
    }
});

// Azure Storage configuration from environment variables
const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploaded-files';
const sasExpiryMinutes = parseInt(process.env.SAS_TOKEN_EXPIRY_MINUTES || '60');

// Validate required environment variables
if (!storageAccountName) {
    console.error('ERROR: AZURE_STORAGE_ACCOUNT_NAME environment variable is required');
    process.exit(1);
}

// Initialize Azure Blob Service Client with Managed Identity
// DefaultAzureCredential automatically uses Managed Identity when running in Azure
// and falls back to Azure CLI credentials for local development
const credential = new DefaultAzureCredential();
const blobServiceClient = new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    credential
);

console.log(`✅ Initialized BlobServiceClient for account: ${storageAccountName}`);
console.log(`✅ Using Managed Identity authentication (DefaultAzureCredential)`);

/**
 * Generates a User Delegation SAS token for a blob
 * User Delegation SAS is the most secure option as it uses Azure AD credentials
 * 
 * @param {string} blobName - Name of the blob
 * @returns {Promise<string>} - SAS URL for the blob
 */
async function generateUserDelegationSAS(blobName) {
    try {
        // Set time boundaries for the SAS token
        const now = new Date();
        const tenMinutesBefore = new Date(now.valueOf() - (10 * 60 * 1000));
        const expiryTime = new Date(now.valueOf() + (sasExpiryMinutes * 60 * 1000));

        console.log(`🔐 Generating User Delegation SAS token for: ${blobName}`);
        console.log(`   Valid from: ${tenMinutesBefore.toISOString()}`);
        console.log(`   Expires at: ${expiryTime.toISOString()}`);

        // Get user delegation key from Azure Storage
        // This key is used to sign the SAS token with Azure AD credentials
        const userDelegationKey = await blobServiceClient.getUserDelegationKey(
            tenMinutesBefore,
            expiryTime
        );

        // Define SAS permissions (read only for download)
        const sasPermissions = BlobSASPermissions.parse('r'); // Read permission only

        // Configure SAS options
        const sasOptions = {
            containerName,
            blobName,
            permissions: sasPermissions,
            protocol: SASProtocol.Https, // HTTPS only for security
            startsOn: tenMinutesBefore,
            expiresOn: expiryTime
        };

        // Generate the SAS token
        const sasToken = generateBlobSASQueryParameters(
            sasOptions,
            userDelegationKey,
            storageAccountName
        ).toString();

        // Construct the full SAS URL
        const blobClient = blobServiceClient
            .getContainerClient(containerName)
            .getBlobClient(blobName);
        
        const sasUrl = `${blobClient.url}?${sasToken}`;

        console.log(`✅ SAS token generated successfully`);
        
        return sasUrl;
    } catch (error) {
        console.error('❌ Error generating SAS token:', error.message);
        throw error;
    }
}

/**
 * Uploads a file to Azure Blob Storage
 * 
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} originalFileName - Original name of the file
 * @returns {Promise<string>} - Name of the uploaded blob
 */
async function uploadFileToBlob(fileBuffer, originalFileName) {
    try {
        // Generate a unique blob name with timestamp to avoid conflicts
        const timestamp = Date.now();
        const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const blobName = `${timestamp}-${sanitizedFileName}`;

        console.log(`📤 Uploading file: ${originalFileName} as ${blobName}`);

        // Get container client and create container if it doesn't exist
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.createIfNotExists();

        // Get blob client and upload the file
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        // Upload with content type detection
        const contentType = getContentType(originalFileName);
        const uploadResponse = await blockBlobClient.upload(
            fileBuffer, 
            fileBuffer.length,
            {
                blobHTTPHeaders: { blobContentType: contentType }
            }
        );

        console.log(`✅ File uploaded successfully. Request ID: ${uploadResponse.requestId}`);
        console.log(`   Blob name: ${blobName}`);
        console.log(`   Size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);

        return blobName;
    } catch (error) {
        console.error('❌ Error uploading file to blob storage:', error.message);
        throw error;
    }
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed'
    };
    return contentTypes[ext] || 'application/octet-stream';
}

// ==================== Express Routes ====================

// Serve static files (HTML frontend)
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        storageAccount: storageAccountName,
        container: containerName,
        sasExpiryMinutes: sasExpiryMinutes
    });
});

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Validate file was uploaded
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file uploaded. Please select a file.' 
            });
        }

        console.log(`\n📥 Received upload request:`);
        console.log(`   File: ${req.file.originalname}`);
        console.log(`   Size: ${(req.file.size / 1024).toFixed(2)} KB`);
        console.log(`   MIME type: ${req.file.mimetype}`);

        // Upload file to blob storage
        const blobName = await uploadFileToBlob(req.file.buffer, req.file.originalname);

        // Generate SAS URL for the uploaded file
        const sasUrl = await generateUserDelegationSAS(blobName);

        // Calculate expiry time for display
        const expiresAt = new Date(Date.now() + (sasExpiryMinutes * 60 * 1000));

        // Return success response
        res.json({
            success: true,
            message: 'File uploaded successfully!',
            fileName: req.file.originalname,
            blobName: blobName,
            sasUrl: sasUrl,
            expiresAt: expiresAt.toISOString(),
            expiresInMinutes: sasExpiryMinutes
        });

        console.log(`✅ Upload completed successfully\n`);

    } catch (error) {
        console.error('❌ Error processing upload:', error);
        res.status(500).json({ 
            error: 'Failed to upload file. Please try again.',
            details: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ 
        error: 'An unexpected error occurred',
        details: err.message 
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`\n🚀 ShareSafely server is running!`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log(`   Storage Account: ${storageAccountName}`);
    console.log(`   Container: ${containerName}`);
    console.log(`   SAS Token Expiry: ${sasExpiryMinutes} minutes`);
    console.log(`\n✨ Ready to accept file uploads!\n`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT signal received: closing HTTP server');
    process.exit(0);
});
