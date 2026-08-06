import {useEffect, useRef, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {getAdminToken, getCommand, sendCommand, grantPersistentAccess, revokePersistentAccess} from '../services/api';
import agoraService from '../services/agoraService';

export default function RemoteControl() {
  const {uniqueId} = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionState, setConnectionState] = useState('Connecting...');
  const [persistentAccess, setPersistentAccess] = useState(false);
  const [screenDimensions, setScreenDimensions] = useState({width: 1080, height: 2400});

  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    const initializeRemoteSession = async () => {
      try {
        setLoading(true);
        setError('');
        setConnectionState('Requesting device approval...');

        // Always send a LIVE_SESSION_REQUEST first
        const {command} = await sendCommand(uniqueId, 'LIVE_SESSION_REQUEST');

        const waitForApproval = async () => {
          if (cancelled) return;
          const {command: latestCommand} = await getCommand(uniqueId, command._id);

          if (latestCommand.status === 'accepted') {
            setConnectionState('Approval received. Getting token...');
            const tokenData = await getAdminToken(uniqueId);
            if (!cancelled) await connectToStream(tokenData);
            return;
          }

          if (latestCommand.status !== 'pending') {
            throw new Error(
              latestCommand.status === 'expired'
                ? 'The device did not approve the session within 5 minutes. Make sure the device is online and try again.'
                : `The session request was ${latestCommand.status}.`,
            );
          }

          setConnectionState('Waiting for approval on the device...');
          retryTimer = window.setTimeout(waitForApproval, 3000);
        };

        await waitForApproval();
      } catch (err) {
        if (cancelled) return;
        console.error('Remote session error:', err);
        setError(err.message || 'Failed to initialize remote session');
        setLoading(false);
        setConnectionState('Connection failed');
      }
    };

    initializeRemoteSession();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      agoraService.leaveChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueId]);

  const connectToStream = async (tokenData) => {
    try {
      setConnectionState('Connecting to stream...');

      if (!tokenData.success) {
        throw new Error(tokenData.message || 'Failed to get token');
      }

      // Initialize Agora client
      agoraService.initializeClient();

      // Subscribe to remote user events
      agoraService.subscribeToRemoteUser(
        (videoTrack) => {
          console.log('Video track received');
          if (videoRef.current) {
            videoTrack.play(videoRef.current);
          }
          setConnected(true);
          setConnectionState('Connected');
        },
        () => {
          console.log('Audio track received');
        }
      );

      // Join channel with correct parameter order (appId, channel, token, uid)
      await agoraService.joinChannel(
        tokenData.appId,
        tokenData.channel,
        tokenData.token,
        null
      );

      setPersistentAccess(false);
      setLoading(false);
      setConnectionState('Waiting for stream...');
    } catch (err) {
      setError(err.message || 'Failed to connect to stream');
      setLoading(false);
      setConnectionState('Connection failed');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
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
          {connectionState.includes('Waiting for approval') && (
            <p className="text-gray-400 text-sm mt-3 max-w-md">
              Open the client app on the device and tap "Approve and start" to begin the remote session.
            </p>
          )}
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
