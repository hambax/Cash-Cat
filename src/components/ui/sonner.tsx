import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-center"
      closeButton
      className="toaster"
      toastOptions={{
        classNames: {
          toast:
            "bg-card text-card-foreground border border-border rounded-xl shadow-md backdrop-blur-sm",
          title: "font-medium",
          description: "text-muted-foreground text-sm",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
