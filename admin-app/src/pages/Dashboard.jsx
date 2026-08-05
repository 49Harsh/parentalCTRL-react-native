import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {enrollDevice, listDevices} from '../services/api';

export default function Dashboard({user, onLogout}) {
  const [devices, setDevices] = useState([]); const [name, setName] = useState(''); const [error, setError] = useState('');
  const navigate = useNavigate();
  const load = () => listDevices().then(data => setDevices(data.devices)).catch(err => setError(err.message));
  useEffect(() => {
    void load();
  }, []);
  const enroll = async event => {event.preventDefault(); try {await enrollDevice(name); setName(''); load();} catch (err) {setError(err.message);}};
  return <main className="min-h-screen bg-slate-50">
    <header className="bg-white border-b border-slate-200"><div className="max-w-6xl mx-auto p-5 flex justify-between items-center"><div><div className="font-bold text-indigo-600">FamilyGuard</div><div className="text-sm text-slate-500">Signed in as {user?.name}</div></div><button onClick={onLogout} className="rounded-lg border px-4 py-2">Log out</button></div></header>
    <section className="max-w-6xl mx-auto p-5 md:p-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8"><div><h1 className="text-3xl font-bold text-slate-900">Your family devices</h1><p className="text-slate-500 mt-2">Monitoring requires visible approval on each device.</p></div><form onSubmit={enroll} className="flex gap-2"><input className="field mb-0" placeholder="Device name" value={name} onChange={e => setName(e.target.value)} required/><button className="rounded-xl bg-indigo-600 px-5 text-white font-semibold">Enroll</button></form></div>
      {error && <p className="bg-red-50 text-red-700 p-3 rounded-xl mb-5">{error}</p>}
      {!devices.length ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">No devices enrolled yet.</div> : <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{devices.map(device => <button key={device._id} onClick={() => navigate(`/devices/${device._id}`)} className="text-left rounded-3xl bg-white border border-slate-200 p-6 shadow-sm hover:shadow-md transition"><div className="flex justify-between"><h2 className="text-xl font-bold">{device.name}</h2><span className={`text-xs px-2 py-1 rounded-full ${device.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100'}`}>{device.isActive ? 'Enrolled' : 'Inactive'}</span></div><div className="font-mono text-indigo-600 mt-4">{device.uniqueId}</div><div className="text-sm text-slate-500 mt-3">Last seen: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}</div><div className="mt-4 text-sm">Monitoring: <b>{device.monitoringEnabled ? 'Enabled' : 'Disabled'}</b></div></button>)}</div>}
    </section>
  </main>;
}
