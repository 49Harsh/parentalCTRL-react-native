import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LiveStreamView from './pages/LiveStreamView';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stream/:uniqueId" element={<LiveStreamView />} />
      </Routes>
    </Router>
  )
}

export default App
