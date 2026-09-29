import type { CSSProperties, ReactNode } from "react";
import type { ToasterProps } from "sonner";

import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useThemeMode } from "../../theme";

function Toaster({ toastOptions, ...props }: ToasterProps): ReactNode {
  const { resolvedTheme } = useThemeMode();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
