import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightAdornment?: React.ReactNode;
  invalid?: boolean;
}

/**
 * Themed text input that matches the warm dark surface. Composes a native
 * <input> with optional left/right slots and a clear invalid state.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightAdornment, invalid, type = 'text', ...props }, ref) => {
    return (
      <div
        className={cn(
          'group relative flex items-center rounded-lg',
          'bg-background border border-input transition-all duration-200 shadow-sm',
          'hover:border-foreground/20 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
          invalid && 'border-destructive focus-within:border-destructive focus-within:ring-destructive',
          className
        )}
      >
        {leftIcon && (
          <div className="pl-3 pr-1 text-muted-foreground group-focus-within:text-primary transition-colors flex items-center">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          type={type}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/70',
            'text-sm h-11 px-3 outline-none border-0',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          {...props}
        />
        {rightAdornment && (
          <div className="pr-2 flex items-center">{rightAdornment}</div>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
