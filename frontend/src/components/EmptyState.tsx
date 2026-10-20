import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        <Inbox size={20} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
