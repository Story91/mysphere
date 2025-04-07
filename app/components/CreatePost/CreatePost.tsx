'use client';

import React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import BanRestriction from '../../admin/components/BanRestriction';

export default function CreatePost() {
  const [content, setContent] = useState('');
  const { address } = useAccount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 Rozpoczynam tworzenie posta...');
    console.log('📝 Treść:', content);
    
    if (!content.trim()) {
      console.log('❌ Pusty post - przerywam');
      return;
    }
    
    try {
      console.log('📤 Wysyłam post do API...');
      const response = await fetch('/api/posts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Błąd odpowiedzi API:', response.status, errorText);
        throw new Error('Nie udało się utworzyć posta');
      }

      console.log('✅ Post utworzony pomyślnie!');
      setContent('');
    } catch (error) {
      console.error('❌ Błąd podczas tworzenia posta:', error);
      if (error instanceof Error) {
        console.error('Szczegóły błędu:', error.message);
      }
    }
  };

  if (!address) {
    console.log('❌ Brak adresu - komponent nie jest renderowany');
    return null;
  }

  console.log('🔄 Renderowanie komponentu CreatePost');
  console.log('📝 Stan:', {
    content: content ? 'wypełnione' : 'puste',
  });

  return (
    <BanRestriction
      fallback={
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
          <div className="text-red-500 dark:text-red-400 text-center">
            You cannot create new posts because your account has been banned
          </div>
        </div>
      }
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
        <form onSubmit={handleSubmit}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              disabled={!content.trim()}
            >
              Opublikuj
            </button>
          </div>
        </form>
      </div>
    </BanRestriction>
  );
} 