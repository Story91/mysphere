# NFT Creator Setup Guide

## Overview
The NFT Creator provides two ways to create IP NFTs using the Origin SDK:

1. **🤖 AI Generate** - Create unique images using Google Vertex AI Imagen models
2. **📁 Upload File** - Upload your own files (images, videos, audio, documents) and mint them as NFTs

## Features

### AI Image Generation
- **Powered by Google Vertex AI Imagen models**
- **8 Artistic Styles**: realistic, artistic, abstract, cyberpunk, vintage, minimalist, fantasy, anime
- **5 Aspect Ratios**: square (1:1), landscape (4:3), portrait (3:4), widescreen (16:9), vertical (9:16)
- **Prompt Enhancement**: Automatically enhances prompts based on selected style
- **Real-time Preview**: See your generated image before minting

### File Upload System
- **Multi-format Support**: Images, videos, audio files, documents (txt, pdf, doc, docx)
- **File Preview**: Visual preview for images and videos
- **Custom Metadata**: Add title and description to your NFTs
- **File Type Detection**: Automatic file type and size detection
- **Drag & Drop Interface**: Easy file selection

## Google Cloud Setup

### 1. Create Google Cloud Project
```bash
# Go to Google Cloud Console
https://console.cloud.google.com/
```

1. Create new project or select existing
2. Enable required APIs:
   - Vertex AI API
   - Cloud Resource Manager API

### 2. Create Service Account
1. Go to IAM & Admin > Service Accounts
2. Create service account with these roles:
   - Vertex AI User
   - Storage Object Viewer (optional)
3. Generate JSON key file

### 3. Environment Variables
Add to your `.env.local`:

```env
# Google Vertex AI Configuration
GOOGLE_VERTEX_PROJECT=your-google-cloud-project-id
GOOGLE_VERTEX_LOCATION=us-central1

# For Edge Runtime (Vercel deployment)
GOOGLE_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
```

## API Endpoint

### `/api/ai-nft-generator/image`
Generates images using Google Vertex Imagen models.

**Request:**
```typescript
POST /api/ai-nft-generator/image
Content-Type: application/json

{
  "prompt": "A futuristic cityscape at sunset",
  "style": "cyberpunk",
  "aspectRatio": "16:9"
}
```

**Response:**
```typescript
{
  "success": true,
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "metadata": {
    "originalPrompt": "A futuristic cityscape at sunset",
    "enhancedPrompt": "A futuristic cityscape at sunset, cyberpunk style, neon lights, futuristic, digital art, sci-fi",
    "aspectRatio": "16:9",
    "style": "cyberpunk"
  }
}
```

## Component Usage

### NftCreator Component
Located at `app/mycamp/components/NftCreator.tsx`

**Integration:**
```tsx
import NftCreator from './components/NftCreator';

// Add to your page
<NftCreator />
```

**Features:**
- Tab-based interface (AI Generate / Upload File)
- Real-time content generation and preview
- Direct integration with Origin SDK for NFT minting
- Responsive design with Framer Motion animations
- Form validation and error handling

## Origin SDK Integration

The component uses the Origin SDK for NFT minting:

```typescript
// Example license terms (free NFT)
const license = {
  price: 0n,
  duration: 0n,
  royaltyBps: 0,
  paymentToken: "0x0000000000000000000000000000000000000000",
} as const;

// Mint NFT
const tokenId = await origin.mintFile(file, metadata, license);
```

### Metadata Structure

**AI Generated Images:**
```typescript
{
  name: "AI Generated Image",
  description: "AI-generated image created with prompt: '...'",
  created_by: "AI Image Generator",
  generation_metadata: {
    originalPrompt: "...",
    enhancedPrompt: "...",
    style: "...",
    aspectRatio: "..."
  },
  content_type: "image"
}
```

**Uploaded Files:**
```typescript
{
  name: "User Provided Title",
  description: "User provided description or default",
  file_type: "image/jpeg",
  file_size: 1048576,
  uploaded_by: "File Upload"
}
```

## Usage Flow

### AI Image Generation
1. Enter descriptive prompt
2. Select artistic style and aspect ratio
3. Click "Generate AI Image"
4. Preview generated image
5. Click "Mint AI Image as NFT"

### File Upload
1. Click "Choose File" or drag & drop
2. Select file (image, video, audio, document)
3. Enter NFT title (required)
4. Add description (optional)
5. Click "Mint File as NFT"

## Supported File Types

- **Images**: jpg, jpeg, png, gif, svg, webp
- **Videos**: mp4, webm, ogg, avi, mov
- **Audio**: mp3, wav, ogg, aac, flac
- **Documents**: txt, pdf, doc, docx

## Cost Considerations

- **Imagen Generation**: ~$0.020 per image
- **File Storage**: Handled by Origin SDK (IPFS/Filecoin)
- **Minting**: Gas fees on BaseCamp testnet (minimal)

## Error Handling

The component handles various error scenarios:

1. **Authentication**: Checks for Origin SDK connection
2. **File Validation**: Ensures valid file types and sizes
3. **Form Validation**: Requires necessary fields before minting
4. **API Errors**: Shows user-friendly error messages
5. **Network Issues**: Graceful handling of connection problems

## Troubleshooting

### Common Issues

1. **"Connect to Origin to Mint"**
   - Ensure wallet is connected
   - Verify Origin SDK authentication
   - Check BaseCamp network connection

2. **Image Generation Fails**
   - Verify Google Cloud credentials
   - Check content policy compliance
   - Ensure sufficient Google Cloud credits

3. **File Upload Issues**
   - Check file size limits
   - Verify supported file types
   - Ensure stable internet connection

4. **Minting Failures**
   - Verify wallet has gas fees
   - Check BaseCamp network status
   - Ensure Origin SDK is properly configured

### Debug Mode
Enable console logging to see detailed error information:

```typescript
console.log('NFT minted successfully with ID:', tokenId);
console.error('Error minting NFT:', error);
```

## Security Best Practices

1. **Never expose private keys** in client-side code
2. **Use environment variables** for sensitive configuration
3. **Validate file uploads** on both client and server
4. **Implement rate limiting** for production use
5. **Monitor API usage** and costs regularly

## Future Enhancements

- Batch file upload and minting
- Advanced image editing tools
- Custom licensing terms configuration
- Enhanced file format support
- Social sharing integration
- Analytics and usage tracking
