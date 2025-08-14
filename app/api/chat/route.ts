import { NextResponse } from 'next/server';
// Optional chat route. Disable import if OPENAI is not used in this deployment to avoid build err
// import OpenAI from 'openai';

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;
    // If OPENAI_API_KEY is not set, short-circuit with 501
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Chat endpoint disabled' }, { status: 501 });
    }
    // Uncomment to enable OpenAI-based chat; ensure openai package is installed
    // const completion = await openai.chat.completions.create({
    //   model: "gpt-3.5-turbo",
    //   messages: messages.map((msg: any) => ({
    //     role: msg.role,
    //     content: msg.content,
    //   })),
    //   temperature: 0.7,
    //   max_tokens: 500,
    // });
    // return NextResponse.json({ response: completion.choices[0].message.content });
    return NextResponse.json({ error: 'Chat endpoint disabled' }, { status: 501 });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
} 