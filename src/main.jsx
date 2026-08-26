import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installMockBridge } from './lib/mockApi.js';
import './index.css';

// Only activates outside Electron (window.studyOS undefined) - lets the app
// render in a plain browser for design review. Inert in the real app.
installMockBridge();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
