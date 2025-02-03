import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      );
    }

    // Check file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images and videos are allowed.' },
        { status: 400 }
      );
    }

    // Generate a unique filename with timestamp
    const timestamp = Date.now();
    const extension = file.type.split('/')[1];
    const filename = `${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`;

    try {
      // Upload to Vercel Blob Storage
      const blob = await put(filename, file, {
        access: 'public',
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      return NextResponse.json({ url: blob.url });
    } catch (uploadError) {
      console.error('Blob storage error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload to blob storage' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Error uploading file' },
      { status: 500 }
    );
  }
} 