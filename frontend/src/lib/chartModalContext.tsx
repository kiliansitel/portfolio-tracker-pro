/**
 * ChartModalContext — global context to open the chart modal from any component
 */
import { createContext, useContext, useState, ReactNode } from 'react';
import { ChartModal } from '../components/ChartModal';

interface ChartModalState {
  symbol: string;
  name?: string;
}

interface ChartModalContextType {
  openChart: (symbol: string, name?: string) => void;
}

const ChartModalContext = createContext<ChartModalContextType>({
  openChart: () => {},
});

export function ChartModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ChartModalState | null>(null);

  const openChart = (symbol: string, name?: string) => setModal({ symbol, name });
  const closeChart = () => setModal(null);

  return (
    <ChartModalContext.Provider value={{ openChart }}>
      {children}
      {modal && (
        <ChartModal symbol={modal.symbol} name={modal.name} onClose={closeChart} />
      )}
    </ChartModalContext.Provider>
  );
}

export function useChartModal() {
  return useContext(ChartModalContext);
}
