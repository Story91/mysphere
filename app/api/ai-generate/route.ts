import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { prompt, network } = await request.json();

    if (!prompt || !network) {
      return NextResponse.json(
        { error: 'Prompt and network are required' },
        { status: 400 }
      );
    }

    // Check if API key exists
    const apiKey = process.env.OPENAI_API_KEY_POST;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Initialize OpenAI client
    const client = new OpenAI({
      apiKey: apiKey
    });

    // Get system message based on network
    const getSystemMessage = (network: string): string => {
      const baseInstruction = "You are a social media content creator who generates viral, engaging posts that drive interaction and community engagement. Write in a conversational, authentic tone that resonates with crypto/blockchain enthusiasts. Use trending formats, emojis strategically, and include calls-to-action. Keep posts concise but impactful.";

      switch (network) {
        case 'basecamp':
          return `${baseInstruction} Focus on Camp Network's community building aspects, gaming features, and innovative ecosystem developments. Make it sound exciting and community-focused.`;
        case 'linea':
          return `${baseInstruction} Focus on Linea's Layer 2 scaling solutions, fast transactions, low fees, and Ethereum compatibility. Highlight speed and efficiency benefits.`;
        case 'base':
        default:
          return `${baseInstruction} Focus on Base blockchain's developer-friendly ecosystem, Coinbase integration, and growing dApp ecosystem. Emphasize accessibility and mainstream adoption.`;
      }
    };

    // Generate AI content
    const response = await client.responses.create({
      model: "gpt-5-nano",
      tools: [
        {
          type: "web_search_preview",
          search_context_size: "low"
        }
      ],
      instructions: getSystemMessage(network),
      input: prompt
    });

    // Get the generated content
    const generatedPost = response.output_text || 'No content generated';

    return NextResponse.json({
      content: generatedPost,
      isAIGenerated: true
    });

  } catch (error) {
    console.error('AI generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI content' },
      { status: 500 }
    );
  }
}
