import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getAdminToken } from '../services/api';
import agoraService from '../services/agoraService';

function LiveStreamView() {
  const { uniqueId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [userName, setUserName] = useState(location.state?.userName || 'User');
  const [connectionState, setConnectionState] = useState('Connecting...');

  useEffect(() => {
    initializeStream();

    return () => {
      // Cleanup on unmount
      handleDisconnect(false);
    };
    // Stream lifecycle is intentionally keyed to the route device id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueId]);

  const initializeStream = async () => {
    try {
      setLoading(true);
      setError('');
      setConnectionState('Getting token...');

      // Get Agora token from backend
      const tokenData = await getAdminToken(uniqueId);

      if (!tokenData.success) {
        throw new Error(tokenData.message || 'Failed to get token');
      }

      setUserName(tokenData.user?.name || userName);
      setConnectionState('Connecting to stream...');

      // Initialize Agora client
      agoraService.initializeClient();

      // Subscribe to remote user events
      agoraService.subscribeToRemoteUser(
        (videoTrack) => {
          // Video track received
          console.log('Video track received');
          if (videoRef.current) {
            videoTrack.play(videoRef.current);
          }
          setConnected(true);
          setConnectionState('Connected');
        },
        () => {
          // Audio playback is managed by the Agora service.
          console.log('Audio track received');
        }
      );

      // Join channel
      await agoraService.joinChannel(
        tokenData.appId,
        tokenData.channel,
        tokenData.token,
        null
      );

      setLoading(false);
      setConnectionState('Waiting for stream...');

    } catch (err) {
      console.error('Stream initialization error:', err);
      setError(err.message || 'Failed to connect to stream');
      setLoading(false);
      setConnectionState('Connection failed');
    }
  };

  const handleDisconnect = async (shouldNavigate = true) => {
    try {
      await agoraService.leaveChannel();
    } catch (err) {
      console.error('Disconnect error:', err);
    } finally {
      if (shouldNavigate) navigate(`/devices/${uniqueId}`);
    }
  };

  const toggleMute = () => {
    const newMutedState = !muted;
    agoraService.muteAudio(newMutedState);
    setMuted(newMutedState);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <svg 
              className="mx-auto h-12 w-12 text-red-500" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Connection Failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate(`/devices/${uniqueId}`)}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 relative">
      {/* User Info Header */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent z-10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-semibold">{userName}</h2>
            <p className="text-gray-300 text-sm font-mono">{uniqueId}</p>
          </div>
          <div className="flex items-center space-x-2">
            <span 
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                connected 
                  ? 'bg-green-500 text-white' 
                  : 'bg-yellow-500 text-black'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
              {connectionState}
            </span>
          </div>
        </div>
      </div>

      {/* Video Container */}
      <div className="w-full h-screen flex items-center justify-center">
        {loading ? (
          <div className="text-center">
            <svg 
              className="animate-spin h-16 w-16 text-indigo-500 mx-auto mb-4" 
              viewBox="0 0 24 24"
            >
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
            <p className="text-white text-lg">{connectionState}</p>
          </div>
        ) : (
          <>
            <div 
              ref={videoRef} 
              className="w-full h-full bg-black"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
            {!connected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-white">
                  <p className="text-xl mb-2">Waiting for stream...</p>
                  <p className="text-sm text-gray-400">
                    Make sure the client device is active
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent z-10 p-6">
        <div className="flex items-center justify-center space-x-4">
          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full transition ${
              muted 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>

          {/* Disconnect Button */}
          <button
            onClick={handleDisconnect}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-semibold transition flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default LiveStreamView;
