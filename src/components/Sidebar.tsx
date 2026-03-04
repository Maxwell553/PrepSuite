
import React from 'react';
import { Search, LayoutDashboard, History, ExternalLink } from 'lucide-react';

interface SidebarProps {
  activeTab: 'search' | 'dashboard' | 'history';
  setActiveTab: (tab: 'search' | 'dashboard' | 'history') => void;
  onLogoClick?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogoClick }) => {
  const menuItems = [
    { id: 'search', icon: Search, label: 'Search Opponent' },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Active Report' },
    { id: 'history', icon: History, label: 'History' },
  ] as const;

  return (
    <aside className="w-64 bg-slate-900 dark:bg-slate-900 bg-white border-r border-slate-800 dark:border-slate-800 border-gray-200 flex flex-col hidden md:flex">
      <div className="p-6">
        <div className="mb-10 flex justify-start -ml-1 py-1">
          {onLogoClick ? (
            <button
              onClick={onLogoClick}
              type="button"
              aria-label="Prepsuite.ai"
              className="logo-button flex items-center hover:opacity-90 transition-opacity cursor-pointer outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 select-none [&:focus]:outline-none [&:focus]:ring-0"
              style={{ outline: 'none' }}
            >
              <img src="/NewLogo.jpg" alt="" className="h-10 w-auto max-h-10 object-contain object-left flex-shrink-0 pointer-events-none select-none" draggable={false} aria-hidden />
            </button>
          ) : (
            <div className="flex items-center select-none">
              <img src="/NewLogo.jpg" alt="" className="h-10 w-auto max-h-10 object-contain object-left flex-shrink-0 pointer-events-none select-none" draggable={false} aria-hidden />
            </div>
          )}
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                  : 'text-slate-400 dark:text-slate-400 text-gray-600 hover:text-white dark:hover:text-white hover:text-gray-900 hover:bg-slate-800 dark:hover:bg-slate-800 hover:bg-gray-100'
                }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-3 border-t border-slate-800/50 dark:border-slate-800/50 border-gray-200">
        <a
          href="https://www.uschess.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-sm text-slate-400 dark:text-slate-400 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors py-1 rounded-lg hover:bg-slate-800/50 px-2 -mx-2"
        >
          <span>USCF Portal</span>
          <ExternalLink className="w-4 h-4 opacity-70" />
        </a>
        <a
          href="https://fide.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-sm text-slate-400 dark:text-slate-400 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors py-1 rounded-lg hover:bg-slate-800/50 px-2 -mx-2"
        >
          <span>FIDE Portal</span>
          <ExternalLink className="w-4 h-4 opacity-70" />
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
