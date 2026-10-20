import type { VerificationStatus } from "@/types/domain";

interface StatusBadgeProps {
  status: VerificationStatus;
}

const labels: Record<VerificationStatus, string> = {
  unverified: "Unverified",
  reviewed: "Reviewed",
  verified: "Verified",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
