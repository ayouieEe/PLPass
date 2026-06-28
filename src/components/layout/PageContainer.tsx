import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("w-full min-w-0 px-4 md:px-6 lg:px-8 2xl:px-10", className)}>
      {children}
    </div>
  );
}
