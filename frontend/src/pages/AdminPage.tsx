import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminMe, listAdminUsers, updateAdminRole } from "@/lib/api/sponsorship";
import { formatDateTime } from "@/lib/format";

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: getAdminMe, retry: false });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: listAdminUsers, enabled: me.data?.is_platform_admin === true, retry: false });
  const roleChange = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => updateAdminRole(id, value),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("Administrator role updated"); },
    onError: (error) => toast.error(errorMessage(error, "Could not update the role.")),
  });
  if (me.isLoading) return <LoadingState label="Checking administrator access…" />;
  if (me.error || !me.data?.is_platform_admin) return <EmptyState icon={<ShieldCheck />} title="Administrator access required" description="This page is available only to platform administrators. Access is enforced by the API, not this screen." />;
  return <>
    <PageHeader title="User management" description="Registered accounts and the small set of platform-administrator grants used by this MVP." />
    {users.error ? <ErrorAlert message={errorMessage(users.error, "Could not load users.")} /> : null}
    {users.isLoading ? <LoadingState label="Loading users…" /> : <Card className="py-0"><Table><TableHeader><TableRow><TableHead className="pl-4">User</TableHead><TableHead>Account</TableHead><TableHead>Role</TableHead><TableHead className="pr-4 text-right">Action</TableHead></TableRow></TableHeader><TableBody>{(users.data ?? []).map((account) => <TableRow key={account.id}><TableCell className="pl-4"><div className="font-medium">{account.email || "No email available"}</div><div className="text-xs text-muted-foreground">Joined {formatDateTime(account.created_at)}</div></TableCell><TableCell>{account.banned_until ? <Badge variant="destructive">Restricted</Badge> : account.email_confirmed_at ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Pending confirmation</Badge>}</TableCell><TableCell>{account.is_platform_admin ? <Badge>Administrator</Badge> : <span className="text-muted-foreground">Organizer</span>}</TableCell><TableCell className="pr-4 text-right">{account.id === user?.id ? <span className="text-xs text-muted-foreground">Your role is protected</span> : <Button size="sm" variant={account.is_platform_admin ? "outline" : "default"} disabled={roleChange.isPending} onClick={() => roleChange.mutate({ id: account.id, value: !account.is_platform_admin })}>{account.is_platform_admin ? "Remove admin" : "Make admin"}</Button>}</TableCell></TableRow>)}</TableBody></Table></Card>}
  </>;
}
