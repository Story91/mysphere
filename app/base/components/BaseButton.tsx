'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface BaseButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gradient';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export default function BaseButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  type = 'button',
}: BaseButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0052FF]/50';

  const variantClasses = {
    primary: 'bg-[#0052FF] text-white hover:bg-[#0041CC] shadow-lg shadow-[#0052FF]/25 hover:shadow-xl hover:shadow-[#0052FF]/30',
    secondary: 'bg-blue-50 text-[#0052FF] hover:bg-blue-100 border border-[#0052FF]/20',
    outline: 'bg-transparent border-2 border-[#0052FF] text-[#0052FF] hover:bg-[#0052FF] hover:text-white',
    ghost: 'bg-transparent text-[#0052FF] hover:bg-blue-50',
    gradient: 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white hover:from-[#0041CC] hover:to-[#0088DD] shadow-lg shadow-[#0052FF]/25',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2.5',
    xl: 'px-8 py-4 text-xl gap-3',
  };

  const disabledClasses = disabled || loading
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : 'hover:scale-[1.02] active:scale-[0.98]';

  const widthClasses = fullWidth ? 'w-full' : '';

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClasses} ${widthClasses} ${className}`}
    >
      {loading && (
        <svg
          className="animate-spin h-5 w-5 mr-2"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="flex-shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && (
        <span className="flex-shrink-0">{icon}</span>
      )}
    </motion.button>
  );
}

// Icon Button variant
export function BaseIconButton({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  className = '',
  tooltip,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  tooltip?: string;
}) {
  const baseClasses = 'inline-flex items-center justify-center rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0052FF]/50';

  const variantClasses = {
    primary: 'bg-[#0052FF] text-white hover:bg-[#0041CC]',
    secondary: 'bg-blue-50 text-[#0052FF] hover:bg-blue-100',
    outline: 'bg-transparent border-2 border-[#0052FF] text-[#0052FF] hover:bg-[#0052FF] hover:text-white',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-[#0052FF]',
  };

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
      title={tooltip}
    >
      {children}
    </motion.button>
  );
}

