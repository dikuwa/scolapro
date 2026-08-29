import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProfileChangeReviewList } from "@/features/profile-changes/profile-change-review-list";
import { getSchoolProfileChangeRequests } from "@/features/profile-changes/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const reviewRoles = new Set(["school_admin","principal","deputy_principal","counsellor"]);

export default async function DataCorrectionsPage() {
  const context=await getUserContext();
  if(!context.user) redirect("/login");
  const membership=context.memberships[0];
  if(!membership||!reviewRoles.has(membership.roleKey)) redirect("/");
  const requests=await getSchoolProfileChangeRequests(membership.schoolId);
  return <AppShell><div className="space-y-5"><div><h1 className="scolapro-page-title text-xl">Data corrections</h1><p className="mt-1 text-sm text-muted-foreground">Review learner and guardian corrections proposed by staff. Authoritative records change only after approval.</p></div><ProfileChangeReviewList requests={requests}/></div></AppShell>;
}