import { Navigate, Route, Routes, useParams } from "react-router-dom";

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
          {/* Email outreach lives on the opportunity page; keep old links working. */}
          <Route path="/outreach/:opportunityId" element={<OutreachRedirect />} />
          <Route path="/calls/:callId" element={<VoiceCallDetailPage />} />
          <Route path="/settings/voice-ai" element={<VoicePreferencesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </ProtectedRoute>
  );
}

function OutreachRedirect() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  return <Navigate to={`/pipeline/${opportunityId}`} replace />;
}
