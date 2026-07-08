// ============================================================
// Button — unified pill button (rounded-full, design-system colors)
// ============================================================

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-8 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-base gap-2',
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-500 text-white hover:bg-blue-500/90 active:bg-blue-500/80 shadow-lg shadow-blue-500/20',
  secondary: 'bg-slate-800 text-slate-100 border border-slate-700/50 hover:bg-slate-700 active:bg-slate-700/80',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100 active:bg-slate-800/80',
  danger: 'bg-red-500 text-white hover:bg-red-500/90 active:bg-red-500/80 shadow-lg shadow-red-500/20',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  className = '',
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={[
        'inline-flex items-center justify-center font-medium rounded-full',
        'transition-all duration-150 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {leftIcon && <span className="shrink-0 inline-flex">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="shrink-0 inline-flex">{rightIcon}</span>}
    </button>
  )
}
