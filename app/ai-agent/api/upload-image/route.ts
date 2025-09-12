import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' }, 
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' }, 
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' }, 
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `flaunch-tokens/${timestamp}-${originalName}`;

    // Upload to Vercel Blob
    const { url } = await put(filename, file, {
      access: 'public',
      token: process.env.NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN
    });

    return NextResponse.json({ 
      success: true,
      imageUrl: url,
      filename: originalName,
      size: file.size 
    });

  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' }, 
      { status: 500 }
    );
  }
}
