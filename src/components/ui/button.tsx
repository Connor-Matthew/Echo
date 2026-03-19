import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "echo-button-base inline-flex items-center justify-center whitespace-nowrap border border-border text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary/92",
        secondary: "border-border/70 bg-secondary text-secondary-foreground hover:bg-accent/65",
        outline: "border-input bg-background text-foreground hover:bg-accent/42",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-accent/50",
        destructive: "border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/14"
      },
      size: {
        default: "h-9 px-3.5 py-1.5",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-10 px-4",
        icon: "h-8 w-8"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);

Button.displayName = "Button";

export { Button, buttonVariants };
