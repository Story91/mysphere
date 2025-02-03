'use client';

import { useState, useEffect } from 'react';
import { useReCaptcha } from '../../hooks/useReCaptcha';
import ReCaptcha from '../ReCaptcha/ReCaptcha';

export const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { token, isVerifying, startVerification } = useReCaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Rozpocznij weryfikację reCAPTCHA przed wysłaniem formularza
      await startVerification('login');
      
      if (!token) {
        console.error('Weryfikacja reCAPTCHA nie powiodła się');
        return;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          recaptchaToken: token
        }),
      });

      if (response.ok) {
        // Obsługa udanego logowania
        console.log('Zalogowano pomyślnie');
      } else {
        // Obsługa błędu
        console.error('Błąd logowania');
      }
    } catch (error) {
      console.error('Błąd:', error);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Hasło
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isVerifying}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {isVerifying ? 'Weryfikacja...' : 'Zaloguj się'}
        </button>
      </form>
      <ReCaptcha action="login" />
    </div>
  );
};

export default LoginForm; 