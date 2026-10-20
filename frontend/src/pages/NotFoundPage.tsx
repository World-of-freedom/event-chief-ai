import { Link } from "react-router-dom";

import { PageHeader } from "@/components/PageHeader";

export function NotFoundPage() {
  return <><PageHeader title="Page not found" description="The requested template route does not exist." /><Link to="/">Return to dashboard</Link></>;
}
