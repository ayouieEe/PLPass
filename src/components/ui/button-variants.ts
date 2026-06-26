import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-danger",
        outline: "border border-input bg-surface text-foreground hover:border-primary-hover hover:bg-primary-hover hover:text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-surface-strong",
        ghost: "hover:bg-secondary-hover hover:text-foreground",
        link: "text-brand-green-primary underline-offset-4 hover:text-primary-hover hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
