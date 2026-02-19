"use client";

import { useState, useEffect } from 'react';

interface SubgraphData {
  success?: boolean;
  action?: string;
  endpoint?: string;
  data?: any;
  error?: string;
  details?: any;
}

const SubgraphTest = () => {
  const [data, setData] = useState<SubgraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState('meta');
  const [endpoint, setEndpoint] = useState('ipmarket'); // public by default

  const testSubgraph = async (testAction: string, testEndpoint?: string) => {
    setLoading(true);
    setAction(testAction);
    if (testEndpoint) setEndpoint(testEndpoint);
    
    const currentEndpoint = testEndpoint || endpoint;
    
    try {
      const response = await fetch(`/api/test-subgraph?action=${testAction}&endpoint=${currentEndpoint}&limit=5`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      setData({ 
        error: 'Network error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    testSubgraph('meta'); // Test meta na start
  }, []);

  return (
    <div className="bg-zinc-900 p-6 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-white">Subgraph Test</h3>
      
      {/* Endpoint Selection */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 mb-2 block">Endpoint:</label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => testSubgraph('meta', 'ipmarket')}
            className={`px-3 py-1 rounded text-sm ${endpoint === 'ipmarket' ? 'bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}
            disabled={loading}
          >
            IpMarket (Public)
          </button>
          <button
            onClick={() => testSubgraph('meta', 'ipmarket3')}
            className={`px-3 py-1 rounded text-sm ${endpoint === 'ipmarket3' ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'}`}
            disabled={loading}
          >
            IpMarket3 (Private)
          </button>
        </div>
      </div>
      
      <div className="flex gap-2 mb-4 flex-wrap">
        <button 
          onClick={() => testSubgraph('meta')}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          disabled={loading}
        >
          Meta
        </button>
        <button 
          onClick={() => testSubgraph('schema')}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
          disabled={loading}
        >
          Schema
        </button>
        <button 
          onClick={() => testSubgraph('listings')}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
          disabled={loading}
        >
          Listings
        </button>
        <button 
          onClick={() => testSubgraph('sales')}
          className="px-3 py-1 bg-orange-600 hover:bg-orange-700 rounded text-sm"
          disabled={loading}
        >
          Sales
        </button>
        <button 
          onClick={() => testSubgraph('access')}
          className="px-3 py-1 bg-pink-600 hover:bg-pink-700 rounded text-sm"
          disabled={loading}
        >
          Access
        </button>
      </div>

      <div className="bg-zinc-800 p-4 rounded min-h-[200px]">
        {loading ? (
          <div className="text-center text-gray-400">Loading...</div>
        ) : data ? (
          <div>
            <div className="mb-2 text-sm text-gray-400">
              Endpoint: {endpoint} | Action: {action} | Status: {data.success ? '✅ Success' : '❌ Error'}
            </div>
            <pre className="text-xs text-gray-300 overflow-auto max-h-96">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="text-gray-400">Click a button to test</div>
        )}
      </div>
    </div>
  );
};

export default SubgraphTest;
