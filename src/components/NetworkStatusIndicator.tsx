/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { detectNetworkQuality } from '@/lib/networkOptimizer';
import { AlertCircle, Wifi } from 'lucide-react';

/**
 * Network Status Indicator Component
 * Shows user the current network quality and gives feedback
 */
export const NetworkStatusIndicator = () => {
  const [quality, setQuality] = useState<string>('4g');
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);

  useEffect(() => {
    // Check network quality on mount and when it changes
    const checkNetwork = () => {
      const networkQuality = detectNetworkQuality();
      setQuality(networkQuality.effectiveType);
      setIsSlowNetwork(
        networkQuality.effectiveType === '2g' || networkQuality.effectiveType === 'slow-2g'
      );
    };

    checkNetwork();

    // Listen for network changes
    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    if (connection) {
      connection.addEventListener('change', checkNetwork);
      return () => connection.removeEventListener('change', checkNetwork);
    }
  }, []);

  if (!isSlowNetwork) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-warning/10 border border-warning rounded-lg px-3 py-2 text-sm text-warning animate-pulse">
      <AlertCircle className="w-4 h-4" />
      <span>
        Slow network detected ({quality}). Using optimized mode - data loads slower but uses less bandwidth.
      </span>
    </div>
  );
};

/**
 * Hook to get current network quality
 */
export const useNetworkQuality = () => {
  const [quality, setQuality] = useState(() => {
    const q = detectNetworkQuality();
    return q.effectiveType;
  });

  useEffect(() => {
    const checkNetwork = () => {
      setQuality(detectNetworkQuality().effectiveType);
    };

    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    if (connection) {
      connection.addEventListener('change', checkNetwork);
      return () => connection.removeEventListener('change', checkNetwork);
    }
  }, []);

  return quality;
};
