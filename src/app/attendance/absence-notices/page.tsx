import {redirect} from "next/navigation";
import {AppShell} from "@/components/shell/app-shell";
import {AbsenceNoticeReview} from "@/features/attendance/absence-notice-review";
import {getSchoolAbsenceNotices} from "@/features/attendance/server/absence-notices";
import {getUserContext} from "@/lib/auth/get-user-context";
export default async function AbsenceNoticesPage(){const context=await getUserContext();if(!context.user)redirect("/login?next=/attendance/absence-notices");const allowed=new Set(["school_admin","principal","deputy_principal","hod","teacher","class_teacher","counsellor"]);const membership=context.memberships.find((item)=>allowed.has(item.roleKey));if(!membership)redirect("/");const notices=await getSchoolAbsenceNotices(membership.schoolId);return <AppShell><div className="space-y-5"><div><h1 className="scolapro-page-title text-xl">Absence evidence</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review private guardian submissions without automatically changing the official attendance register.</p></div><AbsenceNoticeReview notices={notices}/></div></AppShell>}
