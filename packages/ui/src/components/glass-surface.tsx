import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@erebuz/ui/lib/utils";

/**
 * Portable glass material for any UI surface. The exported variant function can
 * also style motion elements, dialogs, buttons, and third-party primitives.
 *
 * Neutral, performant glass for product surfaces: translucent tint, backdrop
 * blur, a restrained border, and depth shadow. No decorative gradients or
 * animated filters, so the material stays quiet and reusable.
 */
export const glassSurfaceVariants = cva(
  "relative isolate border",
  {
    variants: {
      tone: {
        neutral:
          "border-black/10 bg-white/55 text-neutral-950 ring-1 ring-white/55 dark:border-white/12 dark:bg-white/[0.075] dark:text-white dark:ring-white/[0.035]",
        ink: "border-black/12 bg-white/64 text-neutral-950 ring-1 ring-white/60 dark:border-white/12 dark:bg-[#07100e]/62 dark:text-white dark:ring-white/[0.045]",
        clear: "border-black/12 bg-white/26 text-neutral-950 ring-1 ring-white/45 dark:border-white/13 dark:bg-white/[0.058] dark:text-white dark:ring-white/[0.045]",
        light:
          "border-black/8 bg-white/72 text-neutral-950 ring-1 ring-white/55",
      },
      depth: {
        flat: "shadow-none",
        raised: "shadow-[0_12px_36px_rgba(0,0,0,0.22)]",
        floating: "shadow-[0_30px_90px_rgba(0,0,0,0.48)]",
      },
      blur: {
        none: "",
        sm: "backdrop-blur-sm backdrop-saturate-125",
        md: "backdrop-blur-md backdrop-saturate-150",
      },
      interactive: {
        true: "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out hover:border-black/18 hover:bg-white/70 active:scale-[0.985] dark:hover:border-white/18 dark:hover:bg-white/10",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      depth: "raised",
      blur: "sm",
      interactive: false,
    },
  },
);

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
