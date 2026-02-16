import React from 'react';
import { X, Globe } from 'lucide-react';
import { useTheme } from '../lib/themeContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { defaultFederation, setDefaultFederation } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-slate-200 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white dark:text-white text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Default Federation */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 dark:text-slate-300 text-slate-700 uppercase tracking-widest">
              <Globe className="w-4 h-4" />
              Default Federation
            </label>
            <div className="p-4 bg-slate-950 dark:bg-slate-950 bg-slate-50 border border-slate-800 dark:border-slate-800 border-slate-200 rounded-xl space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-500 text-slate-600">
                Select your default federation. This will affect which input fields are shown by default in the search form.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDefaultFederation('FIDE')}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
                    defaultFederation === 'FIDE'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                      : 'bg-slate-800 dark:bg-slate-800 bg-slate-200 text-slate-400 dark:text-slate-400 text-slate-600 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-slate-300'
                  }`}
                >
                  FIDE
                </button>
                <button
                  onClick={() => setDefaultFederation('USCF')}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
                    defaultFederation === 'USCF'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                      : 'bg-slate-800 dark:bg-slate-800 bg-slate-200 text-slate-400 dark:text-slate-400 text-slate-600 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-slate-300'
                  }`}
                >
                  USCF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
