import type { ReactNode } from "react";

interface TemplateNoticeProps {
  children: ReactNode;
}

export function TemplateNotice({ children }: TemplateNoticeProps) {
  return (
    <aside className="template-notice" role="note">
      <strong>Template mode</strong>
      <span>{children}</span>
    </aside>
  );
}
