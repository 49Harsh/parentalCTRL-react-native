import {useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {getDevice, getAdminToken, sendCommand, getCommand, endLiveSession} from '../services/api';

export default function MicView() {
  const {deviceId} = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [connectionState, setConnectionState] = useState('Connecting…');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const audioTrackRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    let rafTimer;

    const start = async () => {
      try {
        setConnectionState('Loading device…');
        const deviceData = await getDevice(deviceId);
        if (cancelled) return;
        setDevice(deviceData.device);
        const uniqueId = deviceData.device.uniqueId;

        setConnectionState('Requesting live session…');
        const {command} = await sendCommand(deviceId, 'LIVE_SESSION_REQUEST');
        if (cancelled) return;

        const waitForApproval = async () => {
          if (cancelled) return;
          try {
            const tokenData = await getAdminToken(uniqueId).catch(() => null);
            if (tokenData?.success) {
              await connect(tokenData);
              return;
            }
            const {command: latest} = await getCommand(deviceId, command._id);
            if (latest.status === 'accepted') {
              const token = await getAdminToken(uniqueId);
              await connect(token);
              return;
            }
            if (latest.status === 'expired') {
              const fresh = await sendCommand(deviceId, 'LIVE_SESSION_REQUEST');
              command._id = fresh.command._id;
            }
            setConnectionState('Waiting for approval on device…');
            retryTimer = window.setTimeout(waitForApproval, 3000);
          } catch (err) {
            if (!cancelled) setError(err.message || 'Approval check failed');
          }
        };
        await waitForApproval();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to start microphone stream');
      }
    };

    const connect = async tokenData => {
      if (cancelled || !tokenData?.success) throw new Error(tokenData?.message || 'Token failed');
      setConnectionState('Connecting to audio channel…');

      const AgoraRTC = await import('agora-rtc-sdk-ng').then(m => m.default);
      AgoraRTC.setLogLevel && AgoraRTC.setLogLevel(0);
      const engine = AgoraRTC.createClient({mode: 'live', codec: 'vp8'});
      engine.setClientRole('audience');
      engineRef.current = engine;

      engine.on('user-published', async (user, mediaType) => {
        await engine.subscribe(user, mediaType);
        if (mediaType === 'audio' && user.audioTrack) {
          audioTrackRef.current = user.audioTrack;
          user.audioTrack.play();
          setConnectionState('🎤 Microphone live');
          trackLevel();
        }
      });

      engine.on('user-unpublished', () => {
        audioTrackRef.current = null;
        setConnectionState('Stream ended');
        setLevel(0);
      });

      await engine.join(tokenData.appId, tokenData.channel, tokenData.token, null);
      setConnectionState('Waiting for microphone…');
    };

    // Simple mic-level animation driven by the remote audio track volume.
    const trackLevel = () => {
      let phase = 0;
      const tick = () => {
        if (cancelled || !audioTrackRef.current) return;
        const track = audioTrackRef.current;
        if (track.getVolumeLevel) {
          setLevel(Math.min(1, track.getVolumeLevel() * 3));
        } else {
          phase += 0.15;
          setLevel(0.25 + Math.abs(Math.sin(phase)) * 0.5);
        }
        rafTimer = window.setTimeout(tick, 150);
      };
      tick();
    };

    start();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(rafTimer);
      if (engineRef.current) engineRef.current.leave().catch(() => {});
      endLiveSession(deviceId);
    };
    // Stream lifecycle is tied to the route param only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioTrackRef.current?.setVolume ? audioTrackRef.current.setVolume(next ? 0 : 100) : audioTrackRef.current?.setEnabled?.(!next);
  };

  const stop = () => {
    if (engineRef.current) engineRef.current.leave().catch(() => {});
    navigate(`/devices/${deviceId}`);
  };

  const bars = 24;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="max-w-3xl mx-auto p-5 md:p-8">
    <button onClick={() => navigate(`/devices/${deviceId}`)} className="text-indigo-400 hover:text-indigo-300">← Back to device</button>
    <h1 className="text-2xl font-bold mt-2">Microphone · {device?.name || 'Device'}</h1>
    {device && <p className="font-mono text-indigo-400 mt-1">{device.uniqueId}</p>}

    {error
      ? <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/40 p-6 text-center">
          <p className="text-red-300 font-semibold mb-2">Microphone connection failed</p>
          <p className="text-sm text-red-200/80">{error}</p>
        </div>
      : <div className="mt-8 rounded-2xl border border-slate-800 bg-black/60 p-10 flex flex-col items-center">
          <div className="flex items-end gap-1.5 h-32" aria-hidden="true">
            {Array.from({length: bars}).map((_, i) => {
              const center = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
              const height = 8 + (1 - center) * level * 110;
              return <span key={i} className="w-2 rounded-full bg-emerald-400 transition-all duration-150" style={{height: `${height}px`, opacity: 0.35 + level * 0.65}}/>;
            })}
          </div>
          <p className="mt-6 text-slate-300">{connectionState}</p>
          {connectionState.includes('approval') && <p className="mt-2 text-sm text-slate-500">Approve the live session request on the client device.</p>}
        </div>}

    <div className="mt-6 flex justify-center gap-3">
      <button onClick={toggleMute} className="rounded-xl border border-slate-600 px-5 py-2.5">{muted ? '🔇 Unmute' : '🔊 Mute'}</button>
      <button onClick={stop} className="rounded-xl bg-red-600 text-white px-5 py-2.5">Stop & close</button>
    </div>

    <p className="mt-6 text-xs text-slate-500 text-center">Audio is streamed through the existing Agora live session (camera + microphone). The client app publishes audio when a live session is active.</p>
  </div></main>;
}
