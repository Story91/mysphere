'use client';

import React, { useState, useRef } from 'react';
import { formatEther } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@campnetwork/origin/react';
import { useAccount } from 'wagmi';
import OriginMint from '../MintIPnft/OriginMint';
import { uploadToIPFS } from '../MintIPnft/upload';
import { useToast } from './Toast';
import FalImageGenerator from './FalImageGenerator';

interface GeneratedImage {
  data: string;
  metadata: any;
}

export default function NftCreator() {
  const auth = useAuth();
  const { address } = useAccount();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'ai-generate' | 'file-upload'>('ai-generate');
  const [uploadTab, setUploadTab] = useState<'image' | 'audio' | 'video' | 'text'>('image');
  
  // AI Generation states
  const [prompt, setPrompt] = useState('');
  const [imageStyle, setImageStyle] = useState('realistic');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  
  // File Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [nftTitle, setNftTitle] = useState('');
  const [nftDescription, setNftDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>('');

  const ACCEPT: Record<typeof uploadTab, string> = {
    image: 'image/jpeg,image/png,image/gif,image/webp',
    audio: 'audio/mpeg,audio/wav,audio/ogg',
    video: 'video/mp4,video/webm',
    text: '.txt',
  } as const;

  const MAX_MB: Record<typeof uploadTab, number> = {
    image: 10,
    audio: 15,
    video: 20,
    text: 10,
  } as const;
  
  // Common states
  const [isMinting, setIsMinting] = useState(false);
  // License controls - price in CAMP tokens
  const [licensePriceCamp, setLicensePriceCamp] = useState<string>('0');
  // AI Name/Description (for generated image)
  const [aiName, setAiName] = useState<string>('');
  const [aiDescription, setAiDescription] = useState<string>('');

  // Function to get skeleton dimensions based on aspect ratio
  const getSkeletonDimensions = (ratio: string) => {
    const baseWidth = 320; // Base width for skeleton (max-w-md is ~384px)
    switch (ratio) {
      case '1:1': return { width: baseWidth, height: baseWidth };
      case '4:3': return { width: baseWidth, height: Math.round(baseWidth * 3/4) };
      case '3:4': return { width: Math.round(baseWidth * 3/4), height: baseWidth };
      case '16:9': return { width: baseWidth, height: Math.round(baseWidth * 9/16) };
      case '9:16': return { width: Math.round(baseWidth * 9/16), height: baseWidth };
      default: return { width: baseWidth, height: baseWidth };
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const response = await fetch('/api/ai-nft-generator/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: imageStyle, aspectRatio }),
      });

      const result = await response.json();

      if (result.success) {
        setGeneratedImage({
          data: result.image,
          metadata: result.metadata,
        });
      } else {
        console.error('Generation failed:', result.error);
      }
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!validateFile(file, uploadTab)) return;

    setSelectedFile(file);
    if (!nftTitle) setNftTitle(file.name.replace(/\.[^/.]+$/, ''));

    // Create preview for images and videos
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type.startsWith('video/')) return '🎬';
    if (file.type.startsWith('audio/')) return '🎵';
    if (file.type.startsWith('text/')) return '📝';
    return '📁';
  };



  const mintAiNft = async () => {
    const { origin } = auth;
    
    if (!generatedImage || !auth.walletAddress || !origin) {
      console.error('No image, wallet, or Origin SDK not connected');
      showToast('Please connect through MyOrigin button first', 'warning');
      return;
    }

    setIsMinting(true);
    try {
      // Convert base64 to File
      const response = await fetch(generatedImage.data);
      const blob = await response.blob();
      const file = new File([blob], `ai-generated-${Date.now()}.png`, { type: 'image/png' });
      const mime = blob.type || 'image/png';
      const fileSizeMb = `${(blob.size / 1024 / 1024).toFixed(2)}MB`;

      // Upload to IPFS
      const formData = new FormData();
      formData.append('file', file);

      const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT_TOKEN;
      
      const uploadResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
      }

      const result = await uploadResponse.json();
      const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;

      // Fetch file from IPFS
      const ipfsResponse = await fetch(ipfsUrl);
      const ipfsBlob = await ipfsResponse.blob();
      const ipfsFile = new File([ipfsBlob], file.name, { type: 'image/png' });

      // Convert CAMP to wei (1 CAMP = 10^18 wei)
      const campAmount = parseFloat(licensePriceCamp || '0');
      const priceWei: bigint = BigInt(Math.floor(campAmount * 1e18));

      // Define license terms for Origin SDK
      const license = {
        price: priceWei,
        duration: 2629800, // 30 days
        royaltyBps: 0,
        paymentToken: "0x0000000000000000000000000000000000000000" as any,
      };

      // Create metadata (user-provided name/description + enriched attributes)
      const metadata = {
        name: aiName && aiName.trim() ? aiName.trim() : 'AI Image',
        description: aiDescription && aiDescription.trim() ? aiDescription.trim() : undefined,
        image: ipfsUrl,
        attributes: [
          { trait_type: "Type", value: "IMAGE" },
          { trait_type: "Style", value: generatedImage.metadata?.style || imageStyle },
          { trait_type: "MIME", value: mime },
          { trait_type: "File Size", value: fileSizeMb },
          { trait_type: "Aspect Ratio", value: generatedImage.metadata?.aspectRatio || aspectRatio },
          { trait_type: "Model", value: generatedImage.metadata?.modelId || 'fal-ai/fast-sdxl' },
          // Price (optional duplication for UI)
          { trait_type: "Price (CAMP)", value: licensePriceCamp || '0' },
          { trait_type: "Price (wei)", value: priceWei.toString() },
        ],
      } as any;

      // Mint using Origin SDK
      console.log('Minting AI NFT with Origin SDK...');
      const tokenId = await origin.mintFile(ipfsFile, metadata, license);
      
      if (!tokenId) {
        throw new Error('Failed to get token ID from minting');
      }
      
      console.log('✅ AI NFT minted successfully! Token ID:', tokenId);
      
      // Format token ID for display
      const shortId = tokenId.length > 15 
        ? `${tokenId.slice(0, 6)}...${tokenId.slice(-4)}`
        : tokenId;
      
      showToast(`AI NFT minted successfully! Token ID: ${shortId}`, 'success', 7000);
      
      // Reset state
      setGeneratedImage(null);
      setPrompt('');
      setAiName('');
      setAiDescription('');
    } catch (error) {
      console.error('❌ Failed to mint AI NFT:', error);
      showToast('Failed to mint AI NFT: ' + (error as any).message, 'error');
    } finally {
      setIsMinting(false);
    }
  };

  const mintFileNft = async () => {
    // Removed - now using MintButton component
  };

  const validateFile = (file: File, kind: typeof uploadTab): boolean => {
    setUploadError('');
    const maxBytes = MAX_MB[kind] * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`File too large. Max size for ${kind} is ${MAX_MB[kind]} MB`);
      return false;
    }
    const accept = ACCEPT[kind].split(',');
    const isAccepted = accept.some((mask) => {
      if (mask.startsWith('.')) return file.name.toLowerCase().endsWith(mask.toLowerCase());
      // mime type
      return file.type === mask;
    });
    if (!isAccepted) {
      setUploadError('Unsupported file type for selected category');
      return false;
    }
    return true;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!validateFile(file, uploadTab)) return;
    setSelectedFile(file);
    if (!nftTitle) setNftTitle(file.name.replace(/\.[^/.]+$/, ''));
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-6 mb-8"
    >

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-black/20 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('ai-generate')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-300 ${
            activeTab === 'ai-generate'
              ? 'bg-purple-500/80 text-white'
              : 'text-purple-300 hover:bg-purple-500/20'
          }`}
        >
          🤖 AI Generate
        </button>
        <button
          onClick={() => setActiveTab('file-upload')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-300 ${
            activeTab === 'file-upload'
              ? 'bg-purple-500/80 text-white'
              : 'text-purple-300 hover:bg-purple-500/20'
          }`}
        >
          📁 Upload File
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'ai-generate' && (
          <motion.div
            key="ai-generate"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            {/* Fal Image Generator (fast-sdxl) */}
            <FalImageGenerator
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              onGenerated={(dataUri, metadata) => {
                setGeneratedImage({ data: dataUri, metadata });
                const meta: any = metadata || {};
                const p: string = meta.enhancedPrompt || meta.originalPrompt || '';
                const defaultName = p ? (p.split(/[,:]/)[0] || '').trim().slice(0, 40) : '';
                if (defaultName && !aiName) setAiName(defaultName);
                if (p && !aiDescription) setAiDescription(p);
              }}
            />

            {/* Generated Image Panel - always visible */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-black/40 border border-purple-500/30 rounded-lg"
            >
              <h4 className="text-lg font-bold text-purple-200 mb-4">Generated Image:</h4>
              <div className="space-y-4">
                {generatedImage ? (
                  <img 
                    src={generatedImage.data} 
                    alt="Generated AI image"
                    className="w-full max-w-md mx-auto rounded-lg border border-purple-500/30"
                  />
                ) : (
                  <div 
                    className="mx-auto rounded-lg border border-purple-500/30 bg-purple-500/10 animate-pulse"
                    style={{
                      width: `${getSkeletonDimensions(aspectRatio).width}px`,
                      height: `${getSkeletonDimensions(aspectRatio).height}px`,
                      maxWidth: '100%'
                    }}
                  />
                )}
                <div className="text-sm text-purple-300">
                  <p><strong>Style:</strong> {generatedImage?.metadata?.style || imageStyle}</p>
                  <p><strong>Aspect Ratio:</strong> {generatedImage?.metadata?.aspectRatio || aspectRatio}</p>
                </div>

                {/* AI Name & Description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-purple-200 text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={aiName}
                      onChange={(e) => setAiName(e.target.value)}
                      placeholder="Enter NFT name..."
                      className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:border-purple-500/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-purple-200 text-sm font-medium mb-1">Description</label>
                    <input
                      type="text"
                      value={aiDescription}
                      onChange={(e) => setAiDescription(e.target.value)}
                      placeholder="Optional description..."
                      className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:border-purple-500/60 focus:outline-none"
                    />
                  </div>
                </div>

                {/* License Controls - Price in CAMP */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-purple-200 text-sm font-medium mb-1">Price in CAMP</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={licensePriceCamp}
                      onChange={(e) => setLicensePriceCamp(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white"
                    />
                    <div className="text-xs text-purple-300 mt-1">
                      ≈ {BigInt(Math.floor(parseFloat(licensePriceCamp || '0') * 1e18)).toString()} wei
                    </div>
                  </div>
                </div>

                {/* Register AI Button */}
                <motion.button
                  onClick={mintAiNft}
                  disabled={isMinting || !generatedImage || !auth.walletAddress || !(auth as any).origin}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-300"
                >
                  {isMinting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                      Registering...
                    </span>
                  ) : !generatedImage ? (
                    'Generate Image First'
                  ) : !(auth as any).origin ? (
                    'Connect MyOrigin First'
                  ) : (
                    '🚀 Register AI to IP'
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'file-upload' && (
          <motion.div
            key="file-upload"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Upload Sub Tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['image','audio','video','text'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setUploadTab(tab);
                    setSelectedFile(null);
                    setFilePreview(null);
                    setUploadError('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className={`py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                    uploadTab === tab ? 'bg-purple-500/80 text-white' : 'bg-black/30 text-purple-300 hover:bg-purple-500/20'
                  }`}
                >
                  {tab === 'image' ? '🖼️ Images' : tab === 'audio' ? '🎵 Audio' : tab === 'video' ? '🎬 Video' : '📝 Text'}
                </button>
              ))}
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                {uploadTab === 'image' && 'Drag and drop your file here, or click to pick one. jpeg, png, gif or webp, max 10 MB'}
                {uploadTab === 'audio' && 'Drag and drop your file here, or click to pick one. mpeg, wav or ogg, max 15 MB'}
                {uploadTab === 'video' && 'Drag and drop your file here, or click to pick one. mp4 or webm, max 20 MB'}
                {uploadTab === 'text' && 'Drag and drop your file here, or click to pick one. txt, max 10 MB'}
              </label>
              <div
                className="relative"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept={ACCEPT[uploadTab]}
                  className="hidden"
                />
                <motion.button
                  onClick={() => fileInputRef.current?.click()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full p-8 border-2 border-dashed border-purple-500/30 rounded-lg hover:border-purple-500/60 transition-colors duration-300 flex flex-col items-center gap-2 text-purple-300 hover:text-purple-200"
                >
                  <div className="text-4xl">📁</div>
                  <div className="text-lg font-medium">Choose File</div>
                  <div className="text-sm opacity-70">
                    {uploadTab === 'image' && 'jpeg, png, gif, webp'}
                    {uploadTab === 'audio' && 'mpeg, wav, ogg'}
                    {uploadTab === 'video' && 'mp4, webm'}
                    {uploadTab === 'text' && 'txt'}
                  </div>
                </motion.button>
                {uploadError && (
                  <div className="mt-2 text-red-300 text-sm">{uploadError}</div>
                )}
              </div>
            </div>

            {/* File Preview */}
            {selectedFile && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-black/40 border border-purple-500/30 rounded-lg"
              >
                <h4 className="text-lg font-bold text-purple-200 mb-4">Selected File:</h4>
                
                <div className="flex items-start gap-4">
                  {filePreview ? (
                    <div className="flex-shrink-0">
                      {selectedFile.type.startsWith('image/') ? (
                        <img 
                          src={filePreview} 
                          alt="File preview"
                          className="w-24 h-24 object-cover rounded-lg border border-purple-500/30"
                        />
                      ) : (
                        <video 
                          src={filePreview} 
                          className="w-24 h-24 object-cover rounded-lg border border-purple-500/30"
                          muted
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-24 h-24 bg-purple-500/20 rounded-lg border border-purple-500/30 flex items-center justify-center text-3xl">
                      {getFileIcon(selectedFile)}
                    </div>
                  )}
                  
                  <div className="flex-grow">
                    <div className="text-purple-200 font-medium">{selectedFile.name}</div>
                    <div className="text-purple-300 text-sm">
                      {selectedFile.type} • {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>

                {/* NFT Metadata */}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-purple-200 text-sm font-medium mb-1">
                      NFT Title:
                    </label>
                    <input
                      type="text"
                      value={nftTitle}
                      onChange={(e) => setNftTitle(e.target.value)}
                      placeholder="Enter title for your NFT..."
                      className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:border-purple-500/60 focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-purple-200 text-sm font-medium mb-1">
                      Description (Optional):
                    </label>
                    <textarea
                      value={nftDescription}
                      onChange={(e) => setNftDescription(e.target.value)}
                      placeholder="Describe your NFT..."
                      className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:border-purple-500/60 focus:outline-none resize-none"
                      rows={2}
                    />
                  </div>

                  {/* License Controls - Price in CAMP */}
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-purple-200 text-sm font-medium mb-1">Price in CAMP</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={licensePriceCamp}
                        onChange={(e) => setLicensePriceCamp(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white"
                      />
                      <div className="text-xs text-purple-300 mt-1">
                        ≈ {BigInt(Math.floor(parseFloat(licensePriceCamp || '0') * 1e18)).toString()} wei
                      </div>
                    </div>
                  </div>
                </div>

                {/* Origin SDK IP NFT Minting */}
                <div className="mt-4">
                  <OriginMint
                    image={selectedFile}
                    address={address || undefined}
                    ipName={nftTitle}
                    ipDescription={nftDescription}
                    onSuccess={(tokenId: string) => {
                      // Clear form after successful minting
                      setSelectedFile(null);
                      setFilePreview(null);
                      setNftTitle('');
                      setNftDescription('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      showToast('Form cleared. Ready for next mint!', 'info', 3000);
                    }}
                  />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
