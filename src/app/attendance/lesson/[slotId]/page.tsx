import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SubjectPeriodRegister } from "@/features/attendance/subject-period-register";
import { getSubjectPeriodRoster, resolveSubjectPeriodAttendanceDate } from "@/features/attendance/server/subject-period";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaDateKey } from "@/lib/namibia-date";

export default async function LessonAttendancePage({ params, searchParams }: { params: Promise<{ slotId: string }>; searchParams: Promise<{ date?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const { slotId } = await params;
  const search = await searchParams;

  const requestedDate = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : null;
  const attendanceDate = requestedDate ?? await resolveSubjectPeriodAttendanceDate(slotId, getNamibiaDateKey());
  if (!attendanceDate) notFound();

  const roster = await getSubjectPeriodRoster(slotId, attendanceDate);
  if (!roster) notFound();

  return <AppShell><div className="space-y-5"><div><Link href="/timetable" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5"/>Timetable</Link><h1 className="scolapro-page-title text-xl">{roster.slot.subjectName}</h1><p className="mt-1 text-sm text-muted-foreground">{roster.slot.className} · {roster.slot.periodName} · {roster.slot.teacherName}</p><div className="mt-3 flex flex-wrap gap-2 text-[0.7rem]"><span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-brand-strong"><CalendarDays className="size-3"/>{attendanceDate}</span><span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-muted-foreground"><Users className="size-3"/>{roster.learners.length} learners</span>{roster.slot.roomLabel?<span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-muted-foreground"><MapPin className="size-3"/>{roster.slot.roomLabel}</span>:null}<span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[color:var(--warning)]"><Clock3 className="size-3"/>Lesson attendance</span></div></div><SubjectPeriodRegister roster={roster} attendanceDate={attendanceDate}/></div></AppShell>;
}
