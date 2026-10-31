import { Navigate, Route, Routes } from "react-router-dom";

import { AuthPage } from "@/auth/AuthPage";
import { AdminPage } from "@/pages/AdminPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { PublicOnlyRoute } from "@/auth/PublicOnlyRoute";
import { UpdatePasswordPage } from "@/auth/UpdatePasswordPage";
import { AppShell } from "@/layouts/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { EventsPage } from "@/pages/EventsPage";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { FollowUpsPage } from "@/pages/FollowUpsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OpportunityPage } from "@/pages/OpportunityPage";
import { PipelinePage } from "@/pages/PipelinePage";
import { ProspectDetailPage } from "@/pages/ProspectDetailPage";
import { SponsorDiscoveryPage } from "@/pages/SponsorDiscoveryPage";
import { TemplateFeaturePage } from "@/pages/TemplateFeaturePage";
import { VoiceCallDetailPage } from "@/pages/VoiceCallDetailPage";
import { VoicePreferencesPage } from "@/pages/VoicePreferencesPage";

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
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/needs" element={<Navigate to="/events" replace />} />
          <Route path="/discovery/leads/:leadId" element={<ProspectDetailPage />} />
          <Route path="/discovery/*" element={<SponsorDiscoveryPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/pipeline/:opportunityId" element={<OpportunityPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/outreach/:opportunityId" element={<TemplateFeaturePage title="Outreach composer" description="An explicit approval gate will be required before messages can be sent." todo="TODO: wire editable drafts, approval records, and a Resend adapter." />} />
          <Route path="/calls/:callId" element={<VoiceCallDetailPage />} />
          <Route path="/settings/voice-ai" element={<VoicePreferencesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </ProtectedRoute>
  );
}
