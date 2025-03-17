'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SendSvg from './svg/SendSvg';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sender?: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

type AgentMode = 'chat' | 'two-agent';

export default function AIChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AgentMode>('chat');
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Start autonomous or two-agent mode
  const startAgent = async () => {
    if (isAgentRunning) return;
    setIsAgentRunning(true);
    
    try {
      const response = await fetch('http://localhost:5000/api/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        throw new Error('Failed to start agent');
      }

      // Start listening for agent updates
      const eventSource = new EventSource('http://localhost:5000/api/events', {
        withCredentials: true
      });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.ping) return; // Ignore ping messages
          
          if (data.messages && data.messages.length > 0) {
            const message = data.messages[0];
            const newMessage: Message = {
              role: message.role || 'assistant',
              content: message.content,
              sender: message.sender,
              tool_calls: message.tool_calls,
            };
            setMessages(prev => [...prev, newMessage]);
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      };

      eventSource.onerror = () => {
        console.error('EventSource failed');
        eventSource.close();
        setIsAgentRunning(false);
      };

      return () => {
        eventSource.close();
      };
    } catch (error) {
      console.error('Error starting agent:', error);
      setIsAgentRunning(false);
    }
  };

  // Stop autonomous or two-agent mode
  const stopAgent = async () => {
    if (!isAgentRunning) return;
    
    try {
      await fetch('http://localhost:5000/api/stop', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error stopping agent:', error);
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          input: input,
          conversation_id: 0
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                break;
              }
              try {
                const content = JSON.parse(data);
                const newMessage: Message = {
                  role: 'assistant',
                  content: content
                };
                setMessages(prev => [...prev, newMessage]);
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, there was an error communicating with the agent.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0E1116] p-4 relative overflow-hidden">
      {/* Background Logos */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div 
          className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] opacity-10 blur-3xl"
          style={{
            backgroundImage: 'url("/elo1.png")',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            transform: 'rotate(-15deg)'
          }}
        />
        <div 
          className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] opacity-10 blur-2xl"
          style={{
            backgroundImage: 'url("/android-chrome-192x192.png")',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            transform: 'rotate(15deg)'
          }}
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-[#1C1F26]/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden border border-[#2A2F3A]/30 relative z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#262A33] border-b border-[#2A2F3A]/30">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img 
                src="/android-chrome-192x192.png" 
                alt="Spherian Logo" 
                className="w-8 h-8"
              />
              <motion.h1 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xl font-bold bg-gradient-to-r from-[#5788FA] to-[#FF00A8] text-transparent bg-clip-text"
              >
                Spherian Agent
              </motion.h1>
            </div>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as AgentMode)}
              className="px-3 py-1.5 rounded-lg bg-[#1C1F26] text-[#5788FA] border border-[#5788FA]/20 focus:outline-none focus:border-[#5788FA]/50 transition-colors text-sm"
              disabled={isAgentRunning}
            >
              <option value="chat">Chat Mode</option>
              <option value="two-agent">Two-Agent Mode</option>
            </select>
          </div>
          {mode !== 'chat' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={isAgentRunning ? stopAgent : startAgent}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                isAgentRunning
                  ? 'bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-500 border border-red-500/20 hover:bg-red-500/30'
                  : 'bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-500 border border-green-500/20 hover:bg-green-500/30'
              }`}
            >
              {isAgentRunning ? 'Stop Agent' : 'Start Agent'}
            </motion.button>
          )}
        </div>

        {/* Messages */}
        <div className="h-[550px] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-[#5788FA]/20 scrollbar-track-transparent">
          <AnimatePresence mode="popLayout">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-4 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-[#5788FA]/10 to-[#5788FA]/20 text-[#5788FA]'
                        : message.role === 'system'
                        ? 'bg-[#262A33] text-[#A0A0A0] font-mono text-sm'
                        : 'bg-[#262A33] text-[#5788FA] border border-[#5788FA]/10'
                    }`}
                  >
                    {message.sender && (
                      <div className="text-sm opacity-75 mb-1 font-medium">
                        {message.sender}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </div>
                    {message.tool_calls && message.tool_calls.map((tool, i) => (
                      <div key={i} className="mt-2 text-xs font-mono text-emerald-500 opacity-75 bg-emerald-500/5 p-2 rounded-lg">
                        Function: {tool.function.name}({tool.function.arguments})
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-[#262A33] rounded-xl p-3">
                    <div className="flex items-center space-x-2">
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="h-2 w-2 bg-[#5788FA] rounded-full"
                      />
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, delay: 0.2, repeat: Infinity }}
                        className="h-2 w-2 bg-[#5788FA] rounded-full"
                      />
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, delay: 0.4, repeat: Infinity }}
                        className="h-2 w-2 bg-[#5788FA] rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </AnimatePresence>
        </div>

        {/* Input */}
        <motion.form 
          onSubmit={handleSubmit}
          className="p-4 bg-[#262A33] border-t border-[#2A2F3A]/30"
        >
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="How can I help?"
                className="flex-1 px-4 py-2 rounded-lg bg-[#1C1F26] text-[#5788FA] placeholder-[#5788FA]/40 border border-[#5788FA]/20 focus:outline-none focus:border-[#5788FA]/50 transition-colors text-sm"
                disabled={isLoading || (mode !== 'chat' && isAgentRunning)}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={!input.trim() || isLoading || (mode !== 'chat' && isAgentRunning)}
                className={`px-4 py-2 rounded-lg transition-all duration-300 ${
                  input.trim() && !isLoading && (mode === 'chat' || !isAgentRunning)
                    ? 'bg-gradient-to-r from-[#5788FA] to-[#FF00A8] text-white shadow-lg shadow-[#5788FA]/20 hover:shadow-[#5788FA]/30'
                    : 'bg-[#1C1F26] text-[#5788FA]/40 cursor-not-allowed'
                }`}
              >
                <SendSvg />
              </motion.button>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => setInput("What actions can you take?")}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#1C1F26] text-[#5788FA]/80 border border-[#5788FA]/20 hover:bg-[#262A33] transition-colors"
              >
                What actions can you take?
              </motion.button>
            </div>
          </div>
        </motion.form>
      </motion.div>
    </div>
  );
}
