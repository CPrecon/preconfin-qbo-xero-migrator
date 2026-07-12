import * as React from "react";
import { cn } from "./utils.js";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[#1e6f74]/20 bg-[#e9f5f3] px-3 py-1 text-xs font-semibold text-[#1e6f74]",
        className,
      )}
      {...props}
    />
  );
}
