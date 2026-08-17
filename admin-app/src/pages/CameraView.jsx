import React, {useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {getDevice, getAdminToken, sendCommand, getCommand, endLiveSession} from '../services/api';

function CameraView() {
  const {deviceId} = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('Connecting...');
  const [muted, setMuted] = useState(false);
  const audioTrackRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    let agoraEngine = null;

    const start = async () => {
      try {
        setLoading(true);
        setError('');
        setConnectionState('Loading device...');

        const deviceData = await getDevice(deviceId);
        if (cancelled) return;
        setDevice(deviceData.device);

        const uniqueId = deviceData.device.uniqueId;
        setConnectionState('Requesting live session...');

        // Request live session (same as LiveStreamView — triggers Agora on client)
        const {command} = await sendCommand(deviceId, 'LIVE_SESSION_REQUEST');
        if (cancelled) return;

        // Wait for approval and token
        const waitForApproval = async () => {
          if (cancelled) return;
          try {
            const tokenData = await getAdminToken(uniqueId).catch(() => null);
            if (tokenData && tokenData.success) {
              if (!cancelled) await connect(tokenData);
              return;
            }
            const {command: latest} = await getCommand(deviceId, command._id);
            if (latest.status === 'accepted') {
              const token = await getAdminToken(uniqueId);
              if (!cancelled) await connect(token);
              return;
            }
            if (latest.status === 'expired') {
              const fresh = await sendCommand(deviceId, 'LIVE_SESSION_REQUEST');
              command._id = fresh.command._id;
            }
            setConnectionState('Waiting for approval on device...');
            retryTimer = window.setTimeout(waitForApproval, 3000);
          } catch (err) {
            if (!cancelled) {
              setError(err.message || 'Approval check failed');
              setLoading(false);
            }
          }
        };
        await waitForApproval();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to start camera stream');
          setLoading(false);
        }
      }
    };

    const connect = async (tokenData) => {
      if (cancelled || !tokenData.success) throw new Error(tokenData.message || 'Token failed');
      setConnectionState('Connecting to Agora...');

      const AgoraRTC = await import('agora-rtc-sdk-ng').then(m => m.default);
      // Suppress Agora's internal telemetry so ad-blockers don't spam the
      // console with ERR_BLOCKED_BY_CLIENT on statscollector URLs.
      AgoraRTC.setLogLevel && AgoraRTC.setLogLevel(0);
      agoraEngine = AgoraRTC.createClient({mode: 'live', codec: 'vp8'});
      agoraEngine.setClientRole('audience');

      agoraEngine.on('user-published', async (user, mediaType) => {
        await agoraEngine.subscribe(user, mediaType);
        if (mediaType === 'video' && user.videoTrack) {
          user.videoTrack.play(videoRef.current);
          setConnected(true);
          setConnectionState('Camera live');
        }
        if (mediaType === 'audio' && user.audioTrack) {
          audioTrackRef.current = user.audioTrack;
          user.audioTrack.play();
        }
      });

      agoraEngine.on('user-unpublished', () => {
        setConnected(false);
        setConnectionState('Stream paused…');
      });

      agoraEngine.on('user-left', () => {
        setConnected(false);
        setConnectionState('Device left the channel');
      });

      await agoraEngine.join(tokenData.appId, tokenData.channel, tokenData.token, null);
      setLoading(false);
      setConnectionState('Waiting for camera...');
    };

    start();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      if (agoraEngine) agoraEngine.leave().catch(() => {});
      endLiveSession(deviceId);
    };
  }, [deviceId]);

  const disconnect = async () => {
    navigate(`/devices/${deviceId}`);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioTrackRef.current?.setVolume?.(next ? 0 : 100);
  };

  if (error) {
    return <main className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Camera Connection Failed</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button onClick={() => navigate(`/devices/${deviceId}`)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg">Back</button>
      </div>
    </main>;
  }

  return <main className="min-h-screen bg-gray-900 relative">
    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent z-10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate(`/devices/${deviceId}`)} className="text-indigo-400 text-sm">← Device</button>
          <h2 className="text-white text-lg font-semibold mt-1">Camera · {device?.name || '...'}</h2>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${connected ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}>
          <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse"/>
          {connectionState}
        </span>
      </div>
    </div>

    <div className="w-full h-screen flex items-center justify-center">
      {loading
        ? <div className="text-center">
            <div className="animate-spin h-16 w-16 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"/>
            <p className="text-white text-lg">{connectionState}</p>
            {connectionState.includes('approval') && <p className="text-gray-400 text-sm mt-3">Approve the live session on the client device.</p>}
          </div>
        : <>
            <div ref={videoRef} className="w-full h-full bg-black"/>
            {!connected && <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-xl">Waiting for camera stream…</p>
            </div>}
          </>}
    </div>

    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent z-10 p-6">
      <div className="flex items-center justify-center space-x-4">
        <button onClick={toggleMute} className={`p-4 rounded-full ${muted ? 'bg-red-600' : 'bg-gray-700'}`}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button onClick={disconnect} className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-semibold">Disconnect</button>
      </div>
    </div>
  </main>;
}

export default CameraView;
