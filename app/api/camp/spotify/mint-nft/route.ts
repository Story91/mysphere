import { NextRequest, NextResponse } from 'next/server';
/**
 * SpotifyAPI i TwitterAPI mieszkaja w @campnetwork/sdk, NIE w @campnetwork/origin.
 *
 * Camp rozdzielil paczki: od @campnetwork/origin 1.3.x te dwie klasy zniknely
 * z eksportow (zero wystapien w core.d.ts i w bundlu), a zyja dalej w osobnej
 * @campnetwork/sdk. Nigdzie tego nie ogloszono - nie ma CHANGELOG ani sekcji
 * migracji. Obie paczki siedza obok siebie w package.json wlasnie dlatego.
 */
import { SpotifyAPI } from '@campnetwork/sdk';

// Types for NFT minting
interface MusicNFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  spotify_data: {
    user_id: string;
    analytics: any;
    listening_diversity: number;
    total_activity: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, spotifyData } = body;

    if (!address || !spotifyData) {
      return NextResponse.json({ 
        success: false, 
        error: 'Address and Spotify data are required' 
      }, { status: 400 });
    }

    const apiKey = process.env.CAMP_API_KEY;
    
    if (!apiKey) {
      throw new Error('Camp API key not found in environment variables');
    }

    console.log('🎵 Preparing to mint Music NFT for:', address);

    // Create comprehensive metadata for the Music NFT
    const metadata: MusicNFTMetadata = {
      name: `${spotifyData.user.display_name || 'Unknown'}'s Music Profile`,
      description: `A unique digital representation of ${spotifyData.user.display_name || 'this user'}'s music taste and listening habits on Spotify. This NFT captures their musical identity through data analytics, showcasing their diversity score of ${spotifyData.analytics.listeningDiversity}% and total music activity.`,
      image: generateMusicNFTImageURL(spotifyData),
      attributes: [
        {
          trait_type: "Listening Diversity",
          value: spotifyData.analytics.listeningDiversity
        },
        {
          trait_type: "Total Saved Tracks",
          value: spotifyData.analytics.totalSavedTracks
        },
        {
          trait_type: "Total Played Tracks", 
          value: spotifyData.analytics.totalPlayedTracks
        },
        {
          trait_type: "Total Albums",
          value: spotifyData.analytics.totalSavedAlbums
        },
        {
          trait_type: "Total Playlists",
          value: spotifyData.analytics.totalSavedPlaylists
        },
        {
          trait_type: "Activity Level",
          value: getActivityLevel(spotifyData.analytics.totalSavedTracks + spotifyData.analytics.totalPlayedTracks)
        },
        {
          trait_type: "Spotify User ID",
          value: spotifyData.user.id
        },
        {
          trait_type: "Minted Date",
          value: new Date().toISOString().split('T')[0]
        }
      ],
      spotify_data: {
        user_id: spotifyData.user.id,
        analytics: spotifyData.analytics,
        listening_diversity: spotifyData.analytics.listeningDiversity,
        total_activity: spotifyData.analytics.totalSavedTracks + spotifyData.analytics.totalPlayedTracks
      }
    };

    // For now, return a success response with metadata
    // In a full implementation, this would use the Origin SDK to mint the actual NFT
    console.log('🎨 Music NFT metadata created:', metadata);

    return NextResponse.json({
      success: true,
      message: 'Music NFT metadata prepared successfully',
      data: {
        metadata,
        preview: {
          name: metadata.name,
          description: metadata.description,
          listening_diversity: spotifyData.analytics.listeningDiversity,
          total_activity: spotifyData.analytics.totalSavedTracks + spotifyData.analytics.totalPlayedTracks,
          rarity: calculateRarity(spotifyData.analytics),
          estimated_value: estimateNFTValue(spotifyData.analytics)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error preparing Music NFT:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to prepare Music NFT',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

// Helper function to generate NFT image URL
function generateMusicNFTImageURL(spotifyData: any): string {
  // In a real implementation, this would generate or use an AI service to create unique images
  // For now, we'll use a placeholder that represents the music data visually
  const diversity = spotifyData.analytics.listeningDiversity;
  const activity = spotifyData.analytics.totalSavedTracks + spotifyData.analytics.totalPlayedTracks;
  
  // This could be a service that generates unique music-themed NFT images based on listening data
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${spotifyData.user.id}&backgroundColor=1db954,1ed760&shape1Color=ffffff&shape2Color=b3b3b3&shape3Color=535353`;
}

// Helper function to determine activity level
function getActivityLevel(totalActivity: number): string {
  if (totalActivity >= 1000) return 'Super Active';
  if (totalActivity >= 500) return 'Very Active';
  if (totalActivity >= 200) return 'Active';
  if (totalActivity >= 50) return 'Moderate';
  return 'Casual';
}

// Helper function to calculate NFT rarity
function calculateRarity(analytics: any): string {
  const diversityScore = analytics.listeningDiversity;
  const totalActivity = analytics.totalSavedTracks + analytics.totalPlayedTracks;
  
  // Calculate rarity based on diversity and activity
  if (diversityScore >= 80 && totalActivity >= 1000) return 'Legendary';
  if (diversityScore >= 70 && totalActivity >= 500) return 'Epic';
  if (diversityScore >= 60 && totalActivity >= 200) return 'Rare';
  if (diversityScore >= 40 && totalActivity >= 50) return 'Uncommon';
  return 'Common';
}

// Helper function to estimate NFT value (in a real scenario)
function estimateNFTValue(analytics: any): string {
  const rarity = calculateRarity(analytics);
  
  switch (rarity) {
    case 'Legendary': return '0.1 - 0.5 ETH';
    case 'Epic': return '0.05 - 0.2 ETH';
    case 'Rare': return '0.02 - 0.1 ETH';
    case 'Uncommon': return '0.01 - 0.05 ETH';
    default: return '0.005 - 0.02 ETH';
  }
} 