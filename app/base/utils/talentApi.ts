// Talent Protocol API for Builder Score
// Reused logic from basechat/BuilderProfile.tsx

export interface TalentScore {
  score: number;
  percentile?: number;
  human_checkmark?: boolean;
}

export interface TalentProfile {
  display_name?: string;
  bio?: string;
  image_url?: string;
  location?: string;
}

const TALENT_API_KEY = process.env.NEXT_PUBLIC_TALENT_PROTOCOL_API_KEY || '';

export async function fetchBuilderScore(walletAddress: string): Promise<TalentScore | null> {
  if (!TALENT_API_KEY) {
    console.warn('Talent Protocol API key not configured');
    return null;
  }

  try {
    // Try different parameter combinations based on the API documentation
    const apiConfigs = [
      { id: walletAddress, account_source: 'wallet' },
      { id: walletAddress },
      { id: walletAddress, account_source: 'wallet', scorer_slug: 'builder_score' },
      { id: walletAddress, scorer_slug: 'builder_score' }
    ];
    
    for (const config of apiConfigs) {
      try {
        const params = new URLSearchParams();
        Object.entries(config).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
        
        const endpoint = `https://api.talentprotocol.com/score?${params.toString()}`;
        
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json',
            'X-API-KEY': TALENT_API_KEY
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        
        if (data.score) {
          // Handle different score structures
          if (typeof data.score === 'object') {
            if (data.score.points !== undefined) {
              return {
                score: data.score.points,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
            if (data.score.value !== undefined) {
              return {
                score: data.score.value,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
            if (data.score.builder_score !== undefined) {
              return {
                score: data.score.builder_score,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
            // Try any numeric value
            const numericValues = Object.entries(data.score).filter(
              ([, value]) => typeof value === 'number'
            );
            if (numericValues.length > 0) {
              return {
                score: numericValues[0][1] as number,
                percentile: data.score.percentile,
                human_checkmark: data.score.human_checkmark
              };
            }
          } else if (typeof data.score === 'number') {
            return {
              score: data.score,
              percentile: data.percentile,
              human_checkmark: data.human_checkmark
            };
          }
        }
        
        if (data.builder_score) {
          return data.builder_score;
        }
        
        if (data.scores && Array.isArray(data.scores) && data.scores.length > 0) {
          return data.scores[0];
        }
      } catch {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Builder Score:', error);
    return null;
  }
}

export async function fetchTalentProfile(walletAddress: string): Promise<TalentProfile | null> {
  if (!TALENT_API_KEY) return null;

  try {
    const response = await fetch(`https://api.talentprotocol.com/profile?id=${walletAddress}`, {
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': TALENT_API_KEY
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.profile || null;
  } catch (error) {
    console.error('Error fetching Talent Profile:', error);
    return null;
  }
}

