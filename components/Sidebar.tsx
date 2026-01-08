
import React from 'react';
import { Search, LayoutDashboard, History, Settings, ExternalLink } from 'lucide-react';

interface SidebarProps {
  activeTab: 'search' | 'dashboard' | 'history';
  setActiveTab: (tab: 'search' | 'dashboard' | 'history') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'search', icon: Search, label: 'Search Opponent' },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Active Report' },
    { id: 'history', icon: History, label: 'History' },
  ] as const;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-xl font-bold italic">PS</span>
          </div>
          <div>
            <div className="font-bold text-sm leading-none tracking-tight">PREPSUITE</div>
            <div className="text-[10px] text-indigo-400 font-bold tracking-widest mt-1 uppercase">Strategic Engine</div>
          </div>
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-4 border-t border-slate-800/50">
        <a
          href="https://fide.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-xs text-slate-500 hover:text-indigo-400 transition-colors"
        >
          <span>FIDE Portal</span>
          <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href="https://chess-results.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-xs text-slate-500 hover:text-indigo-400 transition-colors"
        >
          <span>Tournament Data</span>
          <ExternalLink className="w-3 h-3" />
        </a>
        <button className="w-full flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">
          <Settings className="w-4 h-4" />
          Config
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
