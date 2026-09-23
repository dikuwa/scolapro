import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { NationalCalendarManager } from "@/features/calendar/national-calendar-manager";
import { getNationalLearnerCalendarEvents } from "@/features/calendar/server/teaching-impact";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

export default async function PlatformCalendarPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/platform/calendar");
  if (!context.platformMemberships.some((membership) => membership.roleKey === "platform_admin")) redirect("/");
  const year = getNamibiaCalendarYear();
  const events = await getNationalLearnerCalendarEvents(year);
  return <AppShell><section className="scolapro-content-width"><div className="mb-6"><h1 className="scolapro-page-title">National learner calendar</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Maintain the learner teaching baseline inherited by every school. School-specific events remain local overlays and cannot alter this source record.</p></div><NationalCalendarManager year={year} events={events} /></section></AppShell>;
}
