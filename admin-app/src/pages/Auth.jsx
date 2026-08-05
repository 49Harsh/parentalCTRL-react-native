import {useState} from 'react';
import {login, register} from '../services/api';

export default function Auth({onAuthenticated}) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({name: '', email: '', password: ''});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = mode === 'login' ? await login({email: form.email, password: form.password}) : await register(form);
      localStorage.setItem('authToken', data.token);
      onAuthenticated(data.user);
    } catch (err) { setError(err.message || 'Authentication failed'); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-slate-50 grid place-items-center p-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-slate-200">
      <div className="text-indigo-600 font-bold mb-2">FamilyGuard</div>
      <h1 className="text-3xl font-bold text-slate-900">{mode === 'login' ? 'Parent sign in' : 'Create parent account'}</h1>
      <p className="text-slate-500 mt-2 mb-6">Secure, visible and consent-based family safety controls.</p>
      {mode === 'register' && <input className="field" placeholder="Full name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />}
      <input className="field" type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
      <input className="field" type="password" minLength="6" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 mb-4">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full mt-4 text-sm text-indigo-700">{mode === 'login' ? 'New parent? Create an account' : 'Already registered? Sign in'}</button>
    </form>
  </main>;
}
