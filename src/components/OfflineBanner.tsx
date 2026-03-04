import React from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Sticky banner shown when the user is offline.
 * Helps explain why requests may fail and sets expectations.
 */
const OfflineBanner: React.FC = () => (
  <div
    role="alert"
    className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 dark:bg-amber-600 text-white text-sm font-medium shadow-lg"
  >
    <WifiOff className="w-4 h-4 shrink-0" />
    <span>You appear to be offline. Some features may not work until your connection is restored.</span>
  </div>
);

export default OfflineBanner;
