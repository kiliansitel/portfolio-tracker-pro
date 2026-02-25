import { useEffect, ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-2xl border border-white/10 shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}
export function FormInput({ label, error, className = '', ...props }: InputProps) {
  return (
    <div>
      <label className="block text-gray-400 text-sm font-medium mb-1.5">{label}</label>
      <input
        className={`w-full px-4 py-2.5 bg-[#0d0f14] border ${error ? 'border-red-500/50' : 'border-white/10'} rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors text-sm ${className}`}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}
export function FormSelect({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div>
      <label className="block text-gray-400 text-sm font-medium mb-1.5">{label}</label>
      <select
        className={`w-full px-4 py-2.5 bg-[#0d0f14] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 transition-colors text-sm ${className}`}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function ActionBtn({
  children, onClick, variant = 'primary', disabled = false, className = '',
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'danger' | 'ghost';
  disabled?: boolean; className?: string;
}) {
  const styles = {
    primary: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40',
    danger: 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30',
    ghost: 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
