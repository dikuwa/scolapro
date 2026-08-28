import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SubjectPeriodRegister } from "@/features/attendance/subject-period-register";
import { getSubjectPeriodRoster } from "@/features/attendance/server/subject-period";
import { getUserContext } from "@/lib/auth/get-user-context";

function dateForWeekday(weekday: number) {
  const now = new Date(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  now.setDate(now.getDate() + (weekday - isoDay));
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

export default async function LessonAttendancePage({ params, searchParams }: { params: Promise<{ slotId: string }>; searchParams: Promise<{ date?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const { slotId } = await params;
  const search = await searchParams;

  // Load once to learn the timetable weekday, then choose that date in the current school week.
  const probeDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const probe = await getSubjectPeriodRoster(slotId, probeDate);
  if (!probe) notFound();
  const attendanceDate = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : dateForWeekday(probe.slot.weekday);
  const roster = attendanceDate === probeDate ? probe : await getSubjectPeriodRoster(slotId, attendanceDate);
  if (!roster) notFound();

  return <AppShell><div className="space-y-5"><div><Link href="/timetable" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5"/>Timetable</Link><h1 className="scolapro-page-title text-xl">{roster.slot.subjectName}</h1><p className="mt-1 text-sm text-muted-foreground">{roster.slot.className} · {roster.slot.periodName} · {roster.slot.teacherName}</p><div className="mt-3 flex flex-wrap gap-2 text-[0.7rem]"><span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-brand-strong"><CalendarDays className="size-3"/>{attendanceDate}</span><span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-muted-foreground"><Users className="size-3"/>{roster.learners.length} learners</span>{roster.slot.roomLabel?<span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-muted-foreground"><MapPin className="size-3"/>{roster.slot.roomLabel}</span>:null}<span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[color:var(--warning)]"><Clock3 className="size-3"/>Lesson attendance</span></div></div><SubjectPeriodRegister roster={roster} attendanceDate={attendanceDate}/></div></AppShell>;
}
