import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export function AnimatedNumber({ value, className }: { value: number, className?: string }) {
  const spring = useSpring(value, { mass: 1, stiffness: 400, damping: 40 });
  const display = useTransform(spring, (current) => Math.round(current).toString());

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}

export function AnimatedCurrency({ value, className }: { value: number, className?: string }) {
  const spring = useSpring(value, { mass: 1, stiffness: 400, damping: 40 });
  
  const display = useTransform(spring, (current) => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(current);
    return `${formatted} ETB`;
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
