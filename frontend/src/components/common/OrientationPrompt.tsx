import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RotateCw, Smartphone } from 'lucide-react';

/**
 * Shows a full-screen "Please rotate to landscape" overlay
 * when a tablet-first dashboard is viewed in portrait.
 * Owner dashboard is exempt (handled in App.tsx).
 */
export const OrientationPrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const check = () => {
      const mq = window.matchMedia('(orientation: portrait)');
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isTabletSize = window.innerWidth < 1024 || window.innerHeight < 768;
      setIsPortrait(mq.matches && (isTouchDevice || isTabletSize));
    };

    check();
    const mq = window.matchMedia('(orientation: portrait)');
    mq.addEventListener('change', check);
    window.addEventListener('resize', check);

    return () => {
      mq.removeEventListener('change', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] bg-surface-gradient flex flex-col items-center justify-center p-8 text-center"
    >
      <motion.div
        animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1 }}
        className="mb-6 relative"
      >
        <div className="w-24 h-24 rounded-3xl bg-card border border-border shadow-2xl flex items-center justify-center">
          <Smartphone className="w-12 h-12 text-muted-foreground" />
          <RotateCw className="absolute -right-2 -top-2 w-7 h-7 text-primary" />
        </div>
      </motion.div>
      <h2 className="text-2xl font-display font-semibold text-foreground mb-3">
        Rotate Your Tablet
      </h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        Please rotate your device to <span className="text-primary font-semibold">landscape</span> orientation for the best experience.
      </p>
    </motion.div>
  );
};
