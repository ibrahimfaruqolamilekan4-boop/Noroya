import React from 'react';
import { motion } from 'framer-motion';

interface SuccessFeedbackProps {
  size?: number;
  showConfetti?: boolean;
}

export default function SuccessFeedback({ size = 80, showConfetti = true }: SuccessFeedbackProps) {
  // Generate random values for 20 confetti particles
  const confettiParticles = Array.from({ length: 24 }).map((_, i) => {
    const angle = (i * 360) / 24 + (Math.random() * 15 - 7.5);
    const distance = 80 + Math.random() * 100;
    const xDest = Math.cos((angle * Math.PI) / 180) * distance;
    const yDest = Math.sin((angle * Math.PI) / 180) * distance;
    const colors = [
      'bg-amber-400',
      'bg-emerald-400',
      'bg-blue-500',
      'bg-rose-400',
      'bg-purple-400',
      'bg-yellow-300',
      'bg-green-400',
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const width = 8 + Math.round(Math.random() * 10);
    const height = 4 + Math.round(Math.random() * 12);
    const delay = Math.random() * 0.2;
    const rotation = Math.random() * 360;

    return {
      id: i,
      x: xDest,
      y: yDest,
      color,
      width,
      height,
      delay,
      rotation,
    };
  });

  // Small bursts
  const microBursts = Array.from({ length: 8 }).map((_, i) => {
    const angle = (i * 360) / 8;
    const xDest = Math.cos((angle * Math.PI) / 180) * 45;
    const yDest = Math.sin((angle * Math.PI) / 180) * 45;
    return { id: i, x: xDest, y: yDest };
  });

  return (
    <div className="relative flex items-center justify-center select-none" style={{ minHeight: size + 40 }}>
      {/* 1. Ambient Ring Glow Pulsing under the circle */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{
          opacity: [0, 0.25, 0],
          scale: [0.8, 1.4, 1.6],
        }}
        transition={{
          duration: 1.8,
          ease: "easeOut",
          repeat: Infinity,
          repeatDelay: 0.4,
        }}
        className="absolute w-24 h-24 bg-emerald-400 rounded-full blur-xl pointer-events-none"
      />

      {/* 2. Micro Bursts radial expansion */}
      {microBursts.map((burst) => (
        <motion.div
          key={`burst-${burst.id}`}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{
            x: burst.x,
            y: burst.y,
            scale: [0, 1.2, 0],
            opacity: [0, 1, 0]
          }}
          transition={{
            duration: 0.8,
            ease: "easeOut",
            delay: 0.2,
          }}
          className="absolute w-2 h-2 rounded-full bg-emerald-500 pointer-events-none"
        />
      ))}

      {/* 3. Confetti particles cascading down */}
      {showConfetti &&
        confettiParticles.map((p) => (
          <motion.div
            key={`confetti-${p.id}`}
            style={{
              width: p.width,
              height: p.height,
              borderRadius: p.id % 2 === 0 ? '50%' : '2px',
            }}
            className={`absolute ${p.color} pointer-events-none z-10`}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
            animate={{
              x: [0, p.x, p.x + (Math.random() * 30 - 15)],
              y: [0, p.y, p.y + 120 + Math.random() * 60],
              scale: [0.3, 1, 0.8, 0],
              opacity: [0, 1, 1, 0],
              rotate: [0, p.rotation, p.rotation * 2 + 180]
            }}
            transition={{
              duration: 1.5 + Math.random() * 0.8,
              ease: "easeOut",
              delay: p.delay,
            }}
          />
        ))}

      {/* 4. Main check circle with SVG drawing checkmark */}
      <motion.div
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 20,
          delay: 0.05
        }}
        className="relative z-20 flex items-center justify-center bg-white rounded-full border border-emerald-100 shadow-xl"
        style={{ width: size, height: size }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 52 52"
          className="w-full h-full p-2.5"
        >
          {/* Outer circle line */}
          <motion.circle
            cx="26"
            cy="26"
            r="23"
            fill="none"
            stroke="#10B981"
            strokeWidth="3.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />

          {/* Inner pulse circle fill */}
          <motion.circle
            cx="26"
            cy="26"
            r="23"
            fill="#10B981"
            className="opacity-10 sm:scale-100"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
          />

          {/* Draw checkmark line */}
          <motion.path
            fill="none"
            stroke="#10B981"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 27l8 8 16-16"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              delay: 0.45,
              duration: 0.4,
              ease: "easeOut"
            }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
