import {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {getCallLogs, getCommands, getDevice, getLocations, getNotifications, getUsage, revokeDevice, sendCommand, updateDevice, updatePolicy} from '../services/api';
import LocationMap from '../components/LocationMap';

const callTypeMeta = {
  incoming: {icon: '📞', label: 'Incoming', color: 'text-emerald-700'},
  outgoing: {icon: '📲', label: 'Outgoing', color: 'text-sky-700'},
  missed: {icon: '📵', label: 'Missed', color: 'text-red-700'},
  unknown: {icon: '☎️', label: 'Unknown', color: 'text-slate-600'},
};

const formatDuration = seconds => {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

export default function DeviceDetail() {
  const {deviceId} = useParams(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [locations, setLocations] = useState([]); const [usage, setUsage] = useState([]); const [commands, setCommands] = useState([]); const [notifications, setNotifications] = useState([]); const [calls, setCalls] = useState([]); const [error, setError] = useState('');
  const load = async () => {try {const [device, loc, use, cmd, notice, callLogs] = await Promise.all([getDevice(deviceId), getLocations(deviceId), getUsage(deviceId), getCommands(deviceId), getNotifications(deviceId), getCallLogs(deviceId)]); setData(device); setLocations(loc.locations); setUsage(use.usage); setCommands(cmd.commands); setNotifications(notice.notifications); setCalls(callLogs.calls);} catch (err) {setError(err.message);}};
  useEffect(() => {load(); /* Device data reloads when the route id changes. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);
  if (!data) return <main className="min-h-screen grid place-items-center bg-slate-50">{error || 'Loading device…'}</main>;
  const {device, policy} = data; const status = device.status || {};
  const patchPolicy = async patch => {await updatePolicy(deviceId, patch); load();};
  const batteryPct = typeof status.batteryLevel === 'number' ? Math.round(status.batteryLevel) : null;
  const batteryColor = batteryPct === null ? 'bg-slate-300' : batteryPct > 50 ? 'bg-emerald-500' : batteryPct > 20 ? 'bg-amber-500' : 'bg-red-500';
  return <main className="min-h-screen bg-slate-50"><div className="max-w-6xl mx-auto p-5 md:p-8">
    <button onClick={() => navigate('/')} className="text-indigo-700 mb-5">← All devices</button>
    <div className="flex flex-col md:flex-row justify-between gap-4"><div><h1 className="text-3xl font-bold">{device.name}</h1><p className="font-mono text-indigo-600 mt-1">{device.uniqueId}</p></div><div className="flex gap-2"><button onClick={async () => {await updateDevice(deviceId, {monitoringEnabled: !device.monitoringEnabled}); load();}} className="rounded-xl bg-indigo-600 text-white px-4">{device.monitoringEnabled ? 'Disable monitoring' : 'Enable monitoring'}</button><button onClick={() => navigate(`/screen/${deviceId}`)} className="rounded-xl bg-slate-900 text-white px-4">👁 See Screen</button><button onClick={() => navigate(`/camera/${deviceId}`)} className="rounded-xl bg-emerald-600 text-white px-4">📷 Camera</button><button onClick={() => navigate(`/mic/${deviceId}`)} className="rounded-xl bg-amber-600 text-white px-4">🎤 Mic</button><button onClick={() => navigate(`/remote/${device.uniqueId}`)} className="rounded-xl bg-purple-600 text-white px-4">Remote Control</button></div></div>
    <section className="panel mt-8"><h2>Device status</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
      <div><p className="note">Battery</p>{batteryPct === null ? <p className="empty">No battery data yet</p> : <div className="flex items-center gap-2 mt-1"><div className="h-3 flex-1 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full ${batteryColor}`} style={{width: `${batteryPct}%`}}/></div><b className="text-lg">{status.charging ? '🔌' : '🔋'} {batteryPct}%</b></div>}</div>
      <div><p className="note">Battery health</p><b className={status.batteryHealth === 'good' ? 'text-emerald-700' : ['overheat', 'dead', 'over_voltage', 'failure'].includes(status.batteryHealth) ? 'text-red-700' : ''}>{status.batteryHealth ? status.batteryHealth.replaceAll('_', ' ') : 'unknown'}</b>{status.batteryTemperature ? <p className="note">{status.batteryTemperature}°C · {(status.batteryVoltage / 1000).toFixed(2)}V</p> : null}</div>
      <div><p className="note">Network</p><b>{status.networkType || '—'}</b><p className="note">App v{status.appVersion || '—'}</p></div>
      <div><p className="note">Last seen</p><b>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : '—'}</b></div>
    </div></section>
    <div className="grid lg:grid-cols-2 gap-5 mt-5">
      <section className="panel lg:col-span-2"><h2>Recent location</h2>{locations.length ? <><div className="mt-2 rounded-xl overflow-hidden border border-slate-200"><LocationMap locations={locations}/></div><div className="mt-3">{locations.slice(0, 5).map(item => <div key={item._id} className="row">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}{item.accuracy ? <span className="note"> ±{Math.round(item.accuracy)}m</span> : null} <span>{new Date(item.capturedAt).toLocaleString()}</span></div>)}</div></> : <p className="empty">No location data yet — waiting for the device's first GPS fix.</p>}</section>
      <section className="panel"><h2>Screen-time policy</h2><label>Daily limit (minutes)<input className="field mt-2" type="number" min="0" max="1440" defaultValue={policy?.dailyLimitMinutes} onBlur={e => patchPolicy({dailyLimitMinutes: Number(e.target.value)})}/></label><div className="grid grid-cols-2 gap-3"><label className="toggle"><input type="checkbox" checked={!!policy?.locationSharing} onChange={e => patchPolicy({locationSharing: e.target.checked})}/> Location sharing</label><label className="toggle"><input type="checkbox" checked={!!policy?.usageSharing} onChange={e => patchPolicy({usageSharing: e.target.checked})}/> Usage sharing</label></div><p className="note">Blocking is available only in Android managed-device deployments. Standard installs use reminders and safety alerts.</p></section>
      <section className="panel"><h2>Safe remote actions</h2><div className="flex flex-wrap gap-2">{['STATUS_REFRESH','RING','LOCATION_REFRESH','LIVE_SESSION_REQUEST','SYNC_POLICY','END_SESSION'].map(type => <button key={type} onClick={async () => {await sendCommand(deviceId, type); load();}} className="chip">{type.replaceAll('_',' ')}</button>)}</div><p className="note">Live camera, microphone and screen sessions require a visible approval on the device.</p></section>
      <section className="panel"><h2>App usage</h2>{usage.length ? usage.slice(0, 7).map(item => <div key={item._id} className="row">{item.date}<b>{item.totalMinutes} min</b></div>) : <p className="empty">No usage summaries.</p>}</section>
      <section className="panel"><h2>Call logs</h2>{calls.length ? calls.slice(0, 20).map(item => {const meta = callTypeMeta[item.type] || callTypeMeta.unknown; return <div key={item._id} className="row"><span className={meta.color}><b>{meta.icon} {item.name || item.number || 'Unknown number'}</b>{item.name && item.number ? <span className="note"> · {item.number}</span> : null}<br/><span className="note">{meta.label} · {item.type === 'missed' ? 'not answered' : formatDuration(item.duration)}</span></span><span>{new Date(item.occurredAt).toLocaleString()}</span></div>;}) : <p className="empty">No call log events yet.</p>}</section>
      <section className="panel lg:col-span-2"><h2>Recent notifications</h2>{notifications.length ? notifications.slice(0, 20).map(item => <div key={item._id} className="row"><span><b>{item.packageName}</b><br/>{item.title || item.text || 'Notification content hidden'}</span><span>{new Date(item.postedAt).toLocaleString()}</span></div>) : <p className="empty">No consented notification events.</p>}</section>
      <section className="panel lg:col-span-2"><h2>Command audit</h2>{commands.length ? commands.map(item => <div key={item._id} className="row"><span>{item.type.replaceAll('_',' ')}</span><b>{item.status}</b><span>{new Date(item.createdAt).toLocaleString()}</span></div>) : <p className="empty">No commands sent.</p>}</section>
    </div>
    <button onClick={async () => {if (confirm('Revoke this device?')) {await revokeDevice(deviceId); navigate('/');}}} className="mt-8 text-red-700">Revoke device access</button>
  </div></main>;
}

