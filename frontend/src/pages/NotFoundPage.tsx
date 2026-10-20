import { Link } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="The requested template route does not exist." />
      <EmptyState title="This path is empty" description="Use the sidebar to return to a live workspace page, or go back to the dashboard." />
      <p className="page-cta"><Link className="button" to="/">Return to dashboard</Link></p>
    </>
  );
}
