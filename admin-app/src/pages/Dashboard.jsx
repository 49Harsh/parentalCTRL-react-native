import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyUniqueId } from '../services/api';

function Dashboard() {
  const [uniqueId, setUniqueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase().slice(0, 10);
    setUniqueId(value);
    setError('');
  };

  const validateUniqueId = (id) => {
    // Check if exactly 10 alphanumeric characters
    const regex = /^[A-Z0-9]{10}$/;
    return regex.test(id);
  };

  const handleConnect = async (e) => {
    e.preventDefault();

    // Validation
    if (!uniqueId) {
      setError('Please enter a unique ID');
      return;
    }

    if (uniqueId.length !== 10) {
      setError('Unique ID must be exactly 10 characters');
      return;
    }

    if (!validateUniqueId(uniqueId)) {
      setError('Unique ID must contain only letters and numbers');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify unique ID with backend
      const response = await verifyUniqueId(uniqueId);
      
      if (response.success && response.valid) {
        // Navigate to live stream page with the unique ID
        navigate(`/stream/${uniqueId}`, { 
          state: { userName: response.user?.name || 'User' } 
        });
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError(err.message || 'Failed to verify unique ID. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Parental Control
          </h1>
          <p className="text-gray-600">
            Enter the unique ID to monitor device
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-6">
          <div>
            <label 
              htmlFor="uniqueId" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Unique ID
            </label>
            <input
              type="text"
              id="uniqueId"
              value={uniqueId}
              onChange={handleInputChange}
              placeholder="Enter 10-character ID"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-center text-lg font-mono tracking-wider uppercase"
              maxLength={10}
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              {uniqueId.length}/10 characters
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || uniqueId.length !== 10}
            className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Connecting...
              </span>
            ) : (
              'Connect'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Make sure the client device is active and online
          </p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
