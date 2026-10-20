import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { TemplateNotice } from "@/components/TemplateNotice";

interface TemplateFeaturePageProps {
  title: string;
  description: string;
  todo: string;
}

export function TemplateFeaturePage({ title, description, todo }: TemplateFeaturePageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <TemplateNotice>{todo}</TemplateNotice>
      <EmptyState title="Ready for implementation" description="The route, layout, and API seam are in place; no workflow data is generated or persisted by this template." />
    </>
  );
}
