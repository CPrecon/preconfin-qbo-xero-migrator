"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "../lib/analytics";

type Props = ComponentProps<typeof Link> & {
  event: "preconfin_cta_clicked" | "qbo_connect_clicked";
  eventSource: string;
};

export function TrackedLink({ event, eventSource, onClick, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(clickEvent) => {
        track(event, { source: eventSource });
        onClick?.(clickEvent);
      }}
    />
  );
}
