
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
        <div className="flex items-center gap-3 mb-10">
          {onLogoClick ? (
            <button
              onClick={onLogoClick}
              className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-colors cursor-pointer"
            >
              <span className="text-xl font-bold italic">PS</span>
            </button>
          ) : (
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-xl font-bold italic">PS</span>
            </div>
          )}
          <div>
            <div className="font-bold text-sm leading-none tracking-tight text-white dark:text-white text-gray-900">PREPSUITE</div>
            <div className="text-[10px] text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold tracking-widest mt-1 uppercase">Strategic Engine</div>
          </div>
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
