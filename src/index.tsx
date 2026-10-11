
import React from 'react';
import { MotionConfig } from 'motion/react';
import './components/motion-system.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initSentry } from './lib/sentry';
import './index.css';
import './components/neutral-theme.css';

// Initialize Sentry before rendering the app
void initSentry().catch(() => { /* Monitoring must not block application startup. */ });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
    <MotionConfig reducedMotion="user" transition={{type:"spring",stiffness:300,damping:28}}><App /></MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>
);
