import * as React from "react";
import { cn } from "./utils.js";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e6f74] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-[#1e6f74] text-white hover:bg-[#185c60]",
        variant === "secondary" && "border border-[#16202a]/15 bg-white text-[#16202a] hover:bg-[#f3f5f0]",
        variant === "ghost" && "text-[#16202a] hover:bg-[#16202a]/5",
        className
      )}
      {...props}
    />
  );
}
