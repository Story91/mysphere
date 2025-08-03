import { NextRequest, NextResponse } from 'next/server';
import { createPost } from '../../../utils/firebase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, musicTrack } = body;

    // Get user address from headers or authentication
    // For now, we'll need to implement proper authentication
    // This is a simplified version
    
    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'Post content is required' },
        { status: 400 }
      );
    }

    // For now, we need a way to get the user address
    // In a real implementation, this would come from authentication
    const userAddress = request.headers.get('x-user-address');
    
    if (!userAddress) {
      return NextResponse.json(
        { error: 'User authentication required' },
        { status: 401 }
      );
    }

    // Create the post with music track if provided
    const postId = await createPost({
      author: userAddress,
      content: content.trim(),
      timestamp: Date.now(),
      musicTrack: musicTrack || null,
      network: 'base'
    });

    return NextResponse.json(
      { 
        success: true, 
        postId,
        message: 'Post created successfully'
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating post via API:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}