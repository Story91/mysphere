import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Call Kaito Yaps API
    const response = await fetch(`https://api.kaito.ai/api/v1/yaps?username=${username}`, {
      headers: {
        'Authorization': `Bearer ${process.env.KAITO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Yaps metrics error:', error);
      return NextResponse.json({ error: 'Failed to fetch Yaps metrics' }, { status: 500 });
    }

    const data = await response.json();
    
    // Transform the data to include time-based metrics and percentage changes
    const metrics = {
      total_score: data.yaps_all,
      time_periods: {
        last_24h: data.yaps_l24h,
        last_48h: data.yaps_l48h,
        last_7d: data.yaps_l7d,
        last_30d: data.yaps_l30d,
        last_3m: data.yaps_l3m,
        last_6m: data.yaps_l6m,
        last_12m: data.yaps_l12m
      },
      changes: {
        daily: data.yaps_l24h > 0 ? ((data.yaps_l24h - data.yaps_l48h) / data.yaps_l48h) * 100 : 0,
        weekly: data.yaps_l7d > 0 ? ((data.yaps_l7d - data.yaps_l30d) / data.yaps_l30d) * 100 : 0,
        monthly: data.yaps_l30d > 0 ? ((data.yaps_l30d - data.yaps_l3m) / data.yaps_l3m) * 100 : 0
      }
    };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Yaps metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 