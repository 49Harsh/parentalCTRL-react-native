import {useEffect, useState} from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import DeviceDetail from './pages/DeviceDetail';
import LiveStreamView from './pages/LiveStreamView';
import RemoteControl from './pages/RemoteControl';
import ScreenView from './pages/ScreenView';
import CameraView from './pages/CameraView';
import MicView from './pages/MicView';
import {getMe, logout} from './services/api';

export default function App() {
  const [user, setUser] = useState(null); const [ready, setReady] = useState(false);
  useEffect(() => {if (!localStorage.getItem('authToken')) return setReady(true); getMe().then(data => setUser(data.user)).finally(() => setReady(true));}, []);
  const signOut = async () => {try {await logout();} catch (error) {console.warn('Server logout failed; clearing local session.', error);} localStorage.removeItem('authToken'); setUser(null);};
  if (!ready) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  return <BrowserRouter><Routes>
    <Route path="/auth" element={user ? <Navigate to="/"/> : <Auth onAuthenticated={setUser}/>} />
    <Route path="/" element={user ? <Dashboard user={user} onLogout={signOut}/> : <Navigate to="/auth"/>} />
    <Route path="/devices/:deviceId" element={user ? <DeviceDetail/> : <Navigate to="/auth"/>} />
    <Route path="/stream/:uniqueId" element={user ? <LiveStreamView/> : <Navigate to="/auth"/>} />
    <Route path="/remote/:uniqueId" element={user ? <RemoteControl/> : <Navigate to="/auth"/>} />
    <Route path="/screen/:deviceId" element={user ? <ScreenView/> : <Navigate to="/auth"/>} />
    <Route path="/camera/:deviceId" element={user ? <CameraView/> : <Navigate to="/auth"/>} />
    <Route path="/mic/:deviceId" element={user ? <MicView/> : <Navigate to="/auth"/>} />
  </Routes></BrowserRouter>;
}
