import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function TemplateNotice({ children }: { children: ReactNode }) {
  return (
    <Alert role="note" className="mb-6 border-info/30 bg-info-soft text-info">
      <Info />
      <AlertTitle>Template mode</AlertTitle>
      <AlertDescription className="text-info/90">{children}</AlertDescription>
    </Alert>
  );
}
