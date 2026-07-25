import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@erebuz/ui/lib/utils";

/**
 * Translucent "glass" surface styling, driven by the theme tokens so it adapts
 * to light/dark automatically. Exposes a `cva` you can apply to any element (a
 * div, a button, a motion element, a dialog), plus a `GlassSurface` wrapper.
 */
export const glassSurfaceVariants = cva("relative isolate border", {
  variants: {
    tone: {
      neutral: "border-foreground/10 bg-background/60 ring-1 ring-foreground/10",
      ink: "border-foreground/10 bg-card/70 ring-1 ring-foreground/10",
      clear: "border-foreground/10 bg-foreground/[0.04] ring-1 ring-foreground/10",
      light: "border-foreground/10 bg-background/70 ring-1 ring-foreground/10",
    },
    depth: {
      flat: "shadow-none",
      raised: "shadow-lg shadow-black/[0.06] dark:shadow-xl dark:shadow-black/30",
      floating: "shadow-2xl shadow-black/10 dark:shadow-2xl dark:shadow-black/50",
    },
    blur: {
      none: "",
      sm: "backdrop-blur-sm",
      md: "backdrop-blur-md",
    },
    interactive: {
      true: "transition-[transform,background-color,border-color] duration-200 ease-out hover:bg-foreground/[0.08] active:scale-[0.985]",
      false: "",
    },
  },
  defaultVariants: {
    tone: "neutral",
    depth: "raised",
    blur: "sm",
    interactive: false,
  },
});

export interface GlassSurfaceProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof glassSurfaceVariants> {}

export function GlassSurface({
  className,
  tone,
  depth,
  blur,
  interactive,
  ...props
}: GlassSurfaceProps) {
  return (
    <div
      data-slot="glass-surface"
      className={cn(
        glassSurfaceVariants({ tone, depth, blur, interactive }),
        className,
      )}
      {...props}
    />
  );
}
