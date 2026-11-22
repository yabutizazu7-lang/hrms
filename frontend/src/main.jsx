import React from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom';
import './i18n/index.js'; // initialise English / Amharic before the first render
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css'; import '@fontsource/noto-sans-ethiopic/ethiopic-600.css'; import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
import App from './App.jsx'; import './styles.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
