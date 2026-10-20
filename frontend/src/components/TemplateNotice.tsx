import type { ReactNode } from "react";
import { Info } from "lucide-react";

interface TemplateNoticeProps {
  children: ReactNode;
}

export function TemplateNotice({ children }: TemplateNoticeProps) {
  return (
    <aside className="template-notice" role="note">
      <span className="notice-icon" aria-hidden="true">
        <Info size={16} />
      </span>
      <span>
        <strong>Template mode</strong>
        {children}
      </span>
    </aside>
  );
}
