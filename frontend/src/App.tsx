import { Route, Routes } from "react-router-dom";

import { AuthPage } from "@/auth/AuthPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { PublicOnlyRoute } from "@/auth/PublicOnlyRoute";
import { UpdatePasswordPage } from "@/auth/UpdatePasswordPage";
import { AppShell } from "@/layouts/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProspectDetailPage } from "@/pages/ProspectDetailPage";
import { SponsorDiscoveryPage } from "@/pages/SponsorDiscoveryPage";
import { TemplateFeaturePage } from "@/pages/TemplateFeaturePage";

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />
      <Route path="/auth/update-password" element={<UpdatePasswordPage />} />
      <Route path="/*" element={<ProtectedWorkspace />} />
    </Routes>
  );
}

function ProtectedWorkspace() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/events" element={<TemplateFeaturePage title="Event setup" description="Define the event context that future sponsorship workflows will use." todo="TODO: connect the event form to the protected Event API client." />} />
          <Route path="/needs" element={<TemplateFeaturePage title="Resource needs" description="Capture cash and in-kind targets without combining their reporting." todo="TODO: add validated needs forms and a server-side cash-gap aggregate." />} />
          <Route path="/discovery/leads/:leadId" element={<ProspectDetailPage />} />
          <Route path="/discovery/*" element={<SponsorDiscoveryPage />} />
          <Route path="/pipeline" element={<TemplateFeaturePage title="Sponsorship pipeline" description="A future status view for event opportunities and related activity." todo="TODO: approve transition rules before rendering mutation controls." />} />
          <Route path="/follow-ups" element={<TemplateFeaturePage title="Follow-ups" description="A future home for owned tasks and due-date reminders." todo="TODO: connect task queries and timezone-aware due-date handling." />} />
          <Route path="/outreach/:opportunityId" element={<TemplateFeaturePage title="Outreach composer" description="An explicit approval gate will be required before messages can be sent." todo="TODO: wire editable drafts, approval records, and a Resend adapter." />} />
          <Route path="/calls/:callId" element={<TemplateFeaturePage title="Call review" description="Extracted provider data must remain under organizer review." todo="TODO: wire normalized webhook data and reviewed offer/task creation." />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </ProtectedRoute>
  );
}
