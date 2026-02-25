import { Link2 } from 'lucide-react';

export function Connections() {
  return (
    <div className="p-8 max-w-[1440px] mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link2 className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-white">Connections</h2>
      </div>

      <div className="bg-gradient-to-br from-[#1a1d29] to-[#14161f] rounded-xl border border-white/5 p-12 text-center">
        <Link2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-400 mb-2">Connections page coming soon</h3>
        <p className="text-gray-500">This page is under construction</p>
      </div>
    </div>
  );
}
