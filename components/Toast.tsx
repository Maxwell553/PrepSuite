import React, { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md ${type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100'
                    : 'bg-red-500/10 border-red-500/20 text-red-100'
                }`}>
                {type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                )}

                <p className="text-sm font-medium pr-2">{message}</p>

                <button
                    onClick={onClose}
                    className={`p-1 rounded-lg transition-colors ${type === 'success'
                            ? 'hover:bg-emerald-500/20 text-emerald-400'
                            : 'hover:bg-red-500/20 text-red-400'
                        }`}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default Toast;
