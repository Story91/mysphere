import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '../../utils/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'xp'; // xp, level, elements, spending, pvp
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const skip = (page - 1) * limit;

    // Validate sortBy parameter
    const validSortFields = ['xp', 'baseLevel', 'totalElements', 'totalSpent', 'pvpWins', 'streak'];
    if (!validSortFields.includes(sortBy)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid sortBy parameter. Valid options: ' + validSortFields.join(', ')
      }, { status: 400 });
    }

    const playersCollection = await getCollection('players');

    // Get total count for pagination
    const totalPlayers = await playersCollection.countDocuments({ isActive: true });

    // Build aggregation pipeline for leaderboard
    const pipeline = [
      // Filter active players only
      { $match: { isActive: true } },
      
      // Add computed fields
      {
        $addFields: {
          // Calculate overall score for ranking
          overallScore: {
            $add: [
              { $multiply: ['$xp', 1] },
              { $multiply: ['$baseLevel', 1000] },
              { $multiply: ['$totalElements', 100] },
              { $multiply: ['$pvpWins', 500] },
              { $multiply: ['$streak', 50] }
            ]
          },
          // Calculate efficiency metrics
          xpPerElement: {
            $cond: {
              if: { $gt: ['$totalElements', 0] },
              then: { $divide: ['$xp', '$totalElements'] },
              else: 0
            }
          },
          avgSpentPerElement: {
            $cond: {
              if: { $gt: ['$totalElements', 0] },
              then: { $divide: ['$totalSpent', '$totalElements'] },
              else: 0
            }
          }
        }
      },
      
      // Sort by requested field (descending)
      { $sort: { [sortBy]: -1, overallScore: -1, address: 1 } },
      
      // Add rank field
      {
        $group: {
          _id: null,
          players: { $push: '$$ROOT' }
        }
      },
      {
        $unwind: {
          path: '$players',
          includeArrayIndex: 'rank'
        }
      },
      {
        $addFields: {
          'players.rank': { $add: ['$rank', 1] }
        }
      },
      {
        $replaceRoot: { newRoot: '$players' }
      },
      
      // Pagination
      { $skip: skip },
      { $limit: limit },
      
      // Project final fields
      {
        $project: {
          _id: 0,
          rank: 1,
          address: 1,
          xp: 1,
          baseLevel: 1,
          streak: 1,
          totalElements: 1,
          totalSpent: 1,
          totalEarned: 1,
          pvpWins: 1,
          lastCheckIn: 1,
          lastSeen: 1,
          overallScore: 1,
          xpPerElement: { $round: ['$xpPerElement', 2] },
          avgSpentPerElement: { $round: ['$avgSpentPerElement', 0] },
          // Format addresses for privacy
          displayAddress: {
            $concat: [
              { $substr: ['$address', 0, 6] },
              '...',
              { $substr: ['$address', -4, 4] }
            ]
          }
        }
      }
    ];

    const leaderboard = await playersCollection.aggregate(pipeline).toArray();

    // Get additional statistics
    const statsData = await getGameStatistics();

    return NextResponse.json({
      success: true,
      data: {
        leaderboard,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalPlayers / limit),
          totalPlayers,
          hasNext: skip + limit < totalPlayers,
          hasPrev: page > 1
        },
        sortBy,
        stats: statsData
      }
    });

  } catch (error) {
    console.error('❌ Leaderboard API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch leaderboard data',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 });
  }
}

// Get player rank for specific address
export async function POST(request: NextRequest) {
  try {
    const { address, sortBy = 'xp' } = await request.json();

    if (!address) {
      return NextResponse.json({
        success: false,
        error: 'Address is required'
      }, { status: 400 });
    }

    const playersCollection = await getCollection('players');

    // Find player's rank
    const pipeline = [
      { $match: { isActive: true } },
      {
        $addFields: {
          overallScore: {
            $add: [
              { $multiply: ['$xp', 1] },
              { $multiply: ['$baseLevel', 1000] },
              { $multiply: ['$totalElements', 100] },
              { $multiply: ['$pvpWins', 500] },
              { $multiply: ['$streak', 50] }
            ]
          }
        }
      },
      { $sort: { [sortBy]: -1, overallScore: -1, address: 1 } },
      {
        $group: {
          _id: null,
          players: { $push: { address: '$address', [sortBy]: `$${sortBy}` } }
        }
      },
      {
        $unwind: {
          path: '$players',
          includeArrayIndex: 'rank'
        }
      },
      {
        $match: {
          'players.address': address.toLowerCase()
        }
      },
      {
        $project: {
          _id: 0,
          rank: { $add: ['$rank', 1] },
          address: '$players.address',
          value: `$players.${sortBy}`
        }
      }
    ];

    const result = await playersCollection.aggregate(pipeline).toArray();
    const playerRank = result[0] || null;

    // Get player's full data
    const playerData = await playersCollection.findOne(
      { address: address.toLowerCase() },
      {
        projection: {
          _id: 0,
          address: 1,
          xp: 1,
          baseLevel: 1,
          streak: 1,
          totalElements: 1,
          totalSpent: 1,
          totalEarned: 1,
          pvpWins: 1,
          lastCheckIn: 1,
          lastSeen: 1
        }
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        player: playerData,
        rank: playerRank?.rank || null,
        sortBy,
        found: !!playerData
      }
    });

  } catch (error) {
    console.error('❌ Player rank API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch player rank'
    }, { status: 500 });
  }
}

async function getGameStatistics() {
  try {
    const playersCollection = await getCollection('players');
    const elementsCollection = await getCollection('elements');
    const tradesCollection = await getCollection('trades');

    const [playerStats, elementStats, tradeStats] = await Promise.all([
      // Player statistics
      playersCollection.aggregate([
        {
          $group: {
            _id: null,
            totalPlayers: { $sum: 1 },
            activePlayers: {
              $sum: {
                $cond: [{ $eq: ['$isActive', true] }, 1, 0]
              }
            },
            totalXP: { $sum: '$xp' },
            maxLevel: { $max: '$baseLevel' },
            totalElementsOwned: { $sum: '$totalElements' },
            totalSpent: { $sum: '$totalSpent' },
            avgXP: { $avg: '$xp' },
            avgLevel: { $avg: '$baseLevel' }
          }
        }
      ]).toArray(),

      // Element statistics  
      elementsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalElements: { $sum: 1 },
            totalFused: {
              $sum: {
                $cond: [{ $eq: ['$isFused', true] }, 1, 0]
              }
            },
            avgLevel: { $avg: '$level' },
            rarityDistribution: {
              $push: '$rarity'
            },
            typeDistribution: {
              $push: '$elementType'
            }
          }
        }
      ]).toArray(),

      // Trade statistics
      tradesCollection.aggregate([
        {
          $group: {
            _id: null,
            totalTrades: { $sum: 1 },
            completedTrades: {
              $sum: {
                $cond: [{ $eq: ['$isCompleted', true] }, 1, 0]
              }
            },
            totalVolume: {
              $sum: {
                $cond: [
                  { $eq: ['$isCompleted', true] },
                  { $toDouble: '$price' },
                  0
                ]
              }
            }
          }
        }
      ]).toArray()
    ]);

    return {
      players: playerStats[0] || {},
      elements: elementStats[0] || {},
      trades: tradeStats[0] || {},
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Statistics error:', error);
    return {
      error: 'Failed to fetch statistics',
      lastUpdated: new Date().toISOString()
    };
  }
} 