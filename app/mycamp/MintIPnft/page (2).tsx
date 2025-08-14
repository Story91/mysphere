'use client';


import { useState } from "react";
import MintButton from "./MintButton";

import {
  CampModal,
  useAuth
} from "@campnetwork/origin/react";


export default function Home() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ipName, setIpName] = useState("My IP NFT");
  const [ipDescription, setIpDescription] = useState("Uploaded via Origin SDK");

  const auth = useAuth();
  const address = auth.walletAddress;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setImage(null);
      setImagePreview(null);
      return;
    }
    

    const file = files[0];
    setImage(file);
    
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="absolute top-4 right-4 z-10">
        <CampModal />
      </div>
      
      {/* Main content */}
      <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
        <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start max-w-md w-full">
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">NFT Minting</h1>
            <p className="text-gray-600">Upload an image to mint your NFT</p>
          </div>

          {/* File upload area */}
          <div className="w-full">
            <label 
              htmlFor="image-upload" 
              className="block w-full p-6 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors duration-200"
            >
              <div className="space-y-2">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-gray-600">
                  <span className="font-medium">Click to upload</span> or drag and drop
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB (one image only)</p>
              </div>
            </label>
            <input 
              id="image-upload"
              type="file" 
              accept="image/*" 
              multiple={false}
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {/* Image preview */}
          {imagePreview && (
            <div className="w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Preview</h3>
              <div className="relative group">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-full h-64 object-cover rounded-lg shadow-lg"
                />
                <button
                  onClick={() => {
                    setImage(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* IP Details Form */}
          {imagePreview && (
            <div className="w-full space-y-4">
              <h3 className="text-lg font-medium text-gray-900">IP Details</h3>
              
              <div>
                <label htmlFor="ip-name" className="block text-sm font-medium text-gray-700 mb-2">
                  IP Name *
                </label>
                <input
                  id="ip-name"
                  type="text"
                  value={ipName}
                  onChange={(e) => setIpName(e.target.value)}
                  placeholder="Enter your IP name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900 placeholder-gray-500 transition-colors duration-200"
                  required
                />
                {!ipName.trim() && (
                  <p className="text-sm text-orange-600 mt-1">
                    IP Name is required to register your NFT
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="ip-description" className="block text-sm font-medium text-gray-700 mb-2">
                  IP Description
                </label>
                <textarea
                  id="ip-description"
                  value={ipDescription}
                  onChange={(e) => setIpDescription(e.target.value)}
                  placeholder="Enter a description for your IP"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900 placeholder-gray-500 resize-none transition-colors duration-200"
                />
              </div>
            </div>
          )}

          {/* Mint button */}

          <MintButton
            image={image}
            address={address || undefined}
            ipName={ipName}
            ipDescription={ipDescription}   
          />

          {/* Status messages */}
          {!address && (
            <div className="text-center text-orange-600 bg-orange-50 p-3 rounded-lg">
              Please connect your wallet to mint an NFT
            </div>
          )}
          

        </main>
      </div>
    </div>
  );
}
