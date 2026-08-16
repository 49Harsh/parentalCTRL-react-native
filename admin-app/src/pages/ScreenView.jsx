import {useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {getDevice, pollScreenFrame, getScreenStreamStatus, startScreenStreamCommand, stopScreenStreamCommand} from '../services/api';

const REQUESTED_FPS = 12;
const POLL_MS = 800;
const STATUS_POLL_MS = 5000;
const START_GRACE_MS = 25000;
const STALE_AFTER_MS = 20000;

export default function ScreenView() {
  const {deviceId} = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [frame, setFrame] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [relayInfo, setRelayInfo] = useState(null);
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const lastSeqRef = useRef(-1);
  const lastFrameAtRef = useRef(0);
  const framesRef = useRef(0);
  const startedAtRef = useRef(0);
  const commandSentRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    framesRef.current = 0;
    lastFrameAtRef.current = 0;
    lastSeqRef.current = -1;
    startedAtRef.current = Date.now();
    commandSentRef.current = false;
    setStatus('connecting');
    getDevice(deviceId).then(data => !disposed && setDevice(data.device)).catch(() => {});

    const sendCommand = async () => {
      if (commandSentRef.current || disposed) return;
      commandSentRef.current = true;
      try {
        await startScreenStreamCommand(deviceId, REQUESTED_FPS);
      } catch (err) {
        if (!disposed) setError(err.message || 'Failed to send the stream start command');
      }
    };
    sendCommand();

    // Poll for latest frame
    const poll = async () => {
      if (disposed) return;
      try {
        const data = await pollScreenFrame(deviceId);
        if (disposed) return;
        if (data.success && data.frame && data.frame.seq !== lastSeqRef.current) {
          lastSeqRef.current = data.frame.seq;
          lastFrameAtRef.current = Date.now();
          framesRef.current += 1;
          setFrame(data.frame);
          setStatus('live');
          setError('');
        }
      } catch (err) {
        // Silently retry — network blips should not kill the view.
      }
    };
    const pollTimer = setInterval(poll, POLL_MS);
    poll();

    // Poll for relay diagnostic info
    const pollStatus = async () => {
      if (disposed) return;
      try {
        const data = await getScreenStreamStatus(deviceId);
        if (disposed) return;
        setRelayInfo(data);
      } catch {
        // Diagnostic polling is best-effort.
      }
    };
    const statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
    pollStatus();

    // FPS counter
    let lastCount = 0;
    let lastAt = Date.now();
    const fpsTimer = setInterval(() => {
      const now = Date.now();
      setFps(Math.round(((framesRef.current - lastCount) * 1000) / (now - lastAt)));
      lastCount = framesRef.current;
      lastAt = now;
      setFrameCount(framesRef.current);
    }, 3000);

    // Watchdog
    const watchdog = setInterval(() => {
      if (disposed) return;
      if (!lastFrameAtRef.current && Date.now() - startedAtRef.current > START_GRACE_MS) {
        setStatus('no-frames');
      } else if (lastFrameAtRef.current && Date.now() - lastFrameAtRef.current > STALE_AFTER_MS) {
        setStatus('stale');
      }
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(pollTimer);
      clearInterval(statusTimer);
      clearInterval(fpsTimer);
      clearInterval(watchdog);
    };
  }, [deviceId]);

  const restart = async () => {
    setBusy(true);
    startedAtRef.current = Date.now();
    lastFrameAtRef.current = 0;
    lastSeqRef.current = -1;
    framesRef.current = 0;
    setStatus('connecting');
    setError('');
    try {
      await startScreenStreamCommand(deviceId, REQUESTED_FPS);
    } catch (err) {
      setError(err.message || 'Failed to restart the stream');
    }
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    try {
      await stopScreenStreamCommand(deviceId);
    } catch (err) {
      console.warn('Stop command failed:', err.message);
    }
    setStatus('stopped');
    setBusy(false);
    navigate(`/devices/${deviceId}`);
  };

  const statusLabel = {
    connecting: 'Connecting… waiting for the first frame from the device',
    live: `Live · ~${fps} fps · ${frameCount} frames received`,
    stale: `Stale · last frame ${lastFrameAtRef.current ? Math.round((Date.now() - lastFrameAtRef.current) / 1000) : '?'}s ago · ~${fps} fps`,
    'no-frames': 'No frames received',
    stopped: 'Stream stopped',
  }[status];

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="max-w-6xl mx-auto p-5 md:p-8">
    <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
      <div>
        <button onClick={() => navigate(`/devices/${deviceId}`)} className="text-indigo-400 hover:text-indigo-300">← Back to device</button>
        <h1 className="text-2xl font-bold mt-2">See Screen · {device?.name || 'Device'}</h1>
        {device && <p className="font-mono text-indigo-400 mt-1">{device.uniqueId}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={restart} disabled={busy} className="rounded-xl border border-slate-600 px-4 py-2 disabled:opacity-50">{busy ? 'Working…' : 'Restart stream'}</button>
        <button onClick={stop} disabled={busy} className="rounded-xl bg-red-600 text-white px-4 py-2 disabled:opacity-50">Stop & close</button>
      </div>
    </div>

    <div className="mt-6 flex items-center gap-2 text-sm">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${status === 'live' ? 'bg-emerald-400 animate-pulse' : status === 'stale' ? 'bg-amber-400' : 'bg-slate-500'}`}/>
      <span className="text-slate-300">{statusLabel}</span>
    </div>

    {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

    {/* Diagnostic info */}
    {relayInfo && (
      <div className="mt-3 text-xs text-slate-500 font-mono">
        Backend relay: {relayInfo.lastFrame
          ? `last seq=${relayInfo.lastFrame.seq} · age=${relayInfo.lastFrame.ageMs}ms · ${relayInfo.lastFrame.width}×${relayInfo.lastFrame.height}`
          : 'no frames received from device yet'}
      </div>
    )}

    <div className="mt-4 rounded-2xl border border-slate-800 bg-black grid place-items-center overflow-hidden" style={{minHeight: '55vh'}}>
      {frame
        ? <img key={frame.seq} src={`data:image/jpeg;base64,${frame.image}`} alt="Device screen" className="max-w-full max-h-[75vh] object-contain"/>
        : <div className="p-10 text-center text-slate-400">
            <div className="text-4xl mb-3">👁️</div>
            <p className="font-medium text-slate-200">Waiting for the device screen…</p>
            <p className="mt-2 text-sm">The client app captures screenshots via AccessibilityService and uploads them. First frame may take up to 25 seconds.</p>
          </div>}
    </div>

    <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm text-slate-400">
      <section className="rounded-xl border border-slate-800 p-4">
        <h2 className="font-semibold text-slate-200 mb-2">How it works</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>Admin sends <code>SCREEN_STREAM_START</code> command</li>
          <li>Client picks it up on next heartbeat (~3 s)</li>
          <li><code>AccessibilityService.takeScreenshot()</code> captures the screen</li>
          <li>JPEG frames upload to backend every ~333 ms (OS limit)</li>
          <li>Admin polls latest frame every {POLL_MS} ms</li>
        </ol>
      </section>
      {status === 'no-frames' && <section className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4">
        <h2 className="font-semibold text-amber-300 mb-2">No frames — checklist</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Client app must be <b>online</b> (check last seen on the device page).</li>
          <li><b>Rebuild & reinstall</b> the client app after the code changes: <code>npx react-native run-android</code></li>
          <li>On the device: Settings → Accessibility → <b>FamilyGuard remote control</b> must be ON. If it was already ON, <b>turn it OFF then ON again</b> (Android caches the config).</li>
          <li>Requires <b>Android 11 (API 30)</b> or newer.</li>
          <li>Check the <b>"Backend relay"</b> line above — if it shows frame data, the device is sending but the admin poll might be failing.</li>
          <li>Check the <b>Metro console</b> for logs starting with <code>ScreenStream:</code></li>
        </ul>
      </section>}
    </div>
  </div></main>;
}
