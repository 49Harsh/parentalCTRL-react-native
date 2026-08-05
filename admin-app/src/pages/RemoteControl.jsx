import {useEffect, useRef, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {getAdminToken, sendCommand, grantPersistentAccess, revokePersistentAccess} from '../services/api';
import agoraService from '../services/agoraService';

export default function RemoteControl() {
  const {uniqueId} = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [persistentAccess, setPersistentAccess] = useState(false);
  const [screenDimensions, setScreenDimensions] = useState({width: 1080, height: 2400});

  useEffect(() => {
    initializeRemoteSession();
    return () => {
      agoraService.leaveChannel();
    };
  }, [uniqueId]);

  const initializeRemoteSession = async () => {
    try {
      setLoading(true);
      setError('');

      // Check if persistent access exists
      const tokenData = await getAdminToken(uniqueId);
      
      if (tokenData.success) {
        await connectToStream(tokenData);
        setPersistentAccess(true);
      } else {
        // Request new session
        await requestLiveSession();
      }
    } catch (err) {
      setError(err.message || 'Failed to initialize remote session');
      setLoading(false);
    }
  };

  const requestLiveSession = async () => {
    try {
      const {command} = await sendCommand(uniqueId, 'LIVE_SESSION_REQUEST');
      
      // Poll for approval
      const pollInterval = setInterval(async () => {
        try {
          const tokenData = await getAdminToken(uniqueId);
          if (tokenData.success) {
            clearInterval(pollInterval);
            await connectToStream(tokenData);
          }
        } catch (err) {
          // Still waiting for approval
        }
      }, 3000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (!connected) {
          setError('Session request timed out. Please try again.');
          setLoading(false);
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      setError(err.message || 'Failed to request session');
      setLoading(false);
    }
  };

  const connectToStream = async (tokenData) => {
    try {
      await agoraService.initialize(tokenData.appId);
      await agoraService.joinChannel(tokenData.channelName, tokenData.token);
      
      agoraService.on('user-published', async (user, mediaType) => {
        await agoraService.subscribe(user, mediaType);
        if (mediaType === 'video' && videoRef.current) {
          user.videoTrack?.play(videoRef.current);
        }
      });

      setConnected(true);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to connect to stream');
      setLoading(false);
    }
  };

  const handleCanvasClick = async (e) => {
    if (!canvasRef.current || !connected) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = screenDimensions.width / rect.width;
    const scaleY = screenDimensions.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    try {
      await sendCommand(uniqueId, 'REMOTE_TOUCH', {x, y, type: 'tap'});
    } catch (err) {
      console.error('Failed to send touch command:', err);
    }
  };

  const handleGrantPersistentAccess = async () => {
    try {
      const result = await grantPersistentAccess(uniqueId);
      if (result.success) {
        setPersistentAccess(true);
        alert('Persistent access granted! You can now access this device anytime.');
      }
    } catch (err) {
      alert('Failed to grant persistent access: ' + err.message);
    }
  };

  const handleRevokePersistentAccess = async () => {
    try {
      await revokePersistentAccess(uniqueId);
      setPersistentAccess(false);
      alert('Persistent access revoked.');
    } catch (err) {
      alert('Failed to revoke access: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Connecting to device...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-red-900 text-white p-6 rounded-xl max-w-md">
          <h2 className="text-xl font-bold mb-4">Connection Error</h2>
          <p>{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 bg-white text-red-900 px-4 py-2 rounded-lg font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-white text-xl font-bold">Remote Control: {uniqueId}</h1>
            <p className="text-slate-400 text-sm">
              {persistentAccess ? '✓ Persistent Access Enabled' : 'Session-based Access'}
            </p>
          </div>
          <div className="flex gap-3">
            {!persistentAccess ? (
              <button
                onClick={handleGrantPersistentAccess}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold"
              >
                Grant Persistent Access
              </button>
            ) : (
              <button
                onClick={handleRevokePersistentAccess}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold"
              >
                Revoke Access
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-semibold"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <div className="bg-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="relative" style={{paddingBottom: '56.25%'}}>
            <div
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{touchAction: 'none'}}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4">
          <button
            onClick={() => sendCommand(uniqueId, 'REMOTE_ACTION', {action: 'home'})}
            className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl font-semibold"
          >
            🏠 Home
          </button>
          <button
            onClick={() => sendCommand(uniqueId, 'REMOTE_ACTION', {action: 'back'})}
            className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl font-semibold"
          >
            ← Back
          </button>
          <button
            onClick={() => sendCommand(uniqueId, 'REMOTE_ACTION', {action: 'recents'})}
            className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl font-semibold"
          >
            ▢ Recents
          </button>
          <button
            onClick={() => sendCommand(uniqueId, 'REMOTE_ACTION', {action: 'notifications'})}
            className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl font-semibold"
          >
            🔔 Notifications
          </button>
        </div>

        <div className="mt-6 bg-slate-800 rounded-xl p-4 text-slate-300 text-sm">
          <h3 className="font-bold text-white mb-2">Instructions:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Click anywhere on the screen to tap</li>
            <li>Use buttons above for navigation actions</li>
            <li>Grant persistent access for one-time setup</li>
            <li>All actions are logged and visible on the device</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
