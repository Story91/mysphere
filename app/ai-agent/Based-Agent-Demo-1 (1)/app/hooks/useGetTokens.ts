import { useCallback, useState } from 'react';
import type { Address } from 'viem';
import { API_URL } from '../config';

type UseGetTokensResponse = {
  tokens?: Address[];
  error?: Error;
  getTokens: () => void;
  isLoading: boolean;
};

type UseGetTokensProps = {
  onSuccess?: (tokens: Address[]) => void;
};

export default function useGetTokens({
  onSuccess,
}: UseGetTokensProps): UseGetTokensResponse {
  const [isLoading, setIsLoading] = useState(false);

  const getTokens = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/tokens`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const { tokens } = await response.json();
      onSuccess?.(tokens);
      return { tokens, error: null };
    } catch (error) {
      console.error('Error fetching tokens:', error);
      return { tokens: [], error: error as Error };
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess]);

  return { getTokens, isLoading };
}
