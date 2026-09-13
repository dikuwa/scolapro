import { redirect } from "next/navigation";
import { getDetentionPlanning } from "@/features/late-arrivals/server/planning-queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default async function DetentionPrintRosterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/late-arrivals/print-roster");

  const params = await searchParams;
  const targetSessionId = typeof params.session === "string" ? params.session : "";
  const schoolId = context.currentSchoolMembership?.schoolId;
  if (!schoolId) redirect("/");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const supabase = await createSupabaseServerClient();
  const { data: schoolData } = await supabase
    .from("schools")
    .select("name, code")
    .eq("id", schoolId)
    .maybeSingle();

  const planning = await getDetentionPlanning(schoolId, today);

  const targetSession = targetSessionId
    ? planning.sessions.find((s) => s.id === targetSessionId)
    : planning.sessions[0];

  const sessionDate = targetSession?.sessionDate ?? today;
  const staffById = new Map(planning.staff.map((s) => [s.id, s]));
  const learnerByObligation = new Map(planning.queue.map((q) => [q.obligationId, q]));

  const supervisors = (targetSession?.supervisorIds ?? [])
    .map((id) => staffById.get(id))
    .filter(Boolean);

  const assignments = (targetSession?.learnerAssignments ?? []).map((assignment) => {
    const queueItem = learnerByObligation.get(assignment.obligationId);
    const supervisor = assignment.supervisorStaffMemberId
      ? staffById.get(assignment.supervisorStaffMemberId)
      : null;
    return {
      obligationId: assignment.obligationId,
      learnerName: queueItem?.learnerName ?? "Learner",
      registerClass: queueItem?.registerClass ?? "Class",
      dueOn: queueItem?.dueOn ?? sessionDate,
      supervisorName: supervisor?.name ?? "Unassigned",
      status: assignment.attendanceStatus,
    };
  });

  // Group by class
  const groupedByClass = new Map<string, typeof assignments>();
  for (const item of assignments) {
    const group = groupedByClass.get(item.registerClass) ?? [];
    group.push(item);
    groupedByClass.set(item.registerClass, group);
  }

  return (
    <div className="min-h-screen bg-white p-8 text-black print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; font-size: 11pt; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-lg font-bold">Print Detention Roster</h1>
          <p className="text-xs text-gray-600">Clean print surface for session attendance and outcome recording.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={undefined}
            className="rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-semibold hover:bg-gray-200"
          >
            <script dangerouslySetInnerHTML={{ __html: `/* inline script */` }} />
            Print Roster
          </button>
        </div>
      </div>

      <header className="border-b-2 border-black pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide">{schoolData?.name ?? "ScolaPro Partner School"}</h1>
            <p className="text-sm font-semibold uppercase text-gray-700">Official Friday Detention Register</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold">Date: {formatDate(sessionDate)}</p>
            <p className="text-gray-600">Generated: {new Date().toLocaleDateString("en-NA")}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-300 pt-3 text-xs">
          <div>
            <span className="font-semibold text-gray-600">Venue / Location:</span>
            <p className="font-bold">{targetSession?.location || "Designated Detention Room"}</p>
          </div>
          <div>
            <span className="font-semibold text-gray-600">Scheduled Time:</span>
            <p className="font-bold">
              {targetSession?.startsAt ? `${targetSession.startsAt.slice(0, 5)} - ${targetSession.endsAt?.slice(0, 5) ?? ""}` : "14:00 - 15:30"}
            </p>
          </div>
          <div>
            <span className="font-semibold text-gray-600">Duty Team Supervisors:</span>
            <p className="font-bold">
              {supervisors.length ? supervisors.map((s) => s?.name).join(", ") : "Duty Staff Assigned"}
            </p>
          </div>
        </div>
      </header>

      <main className="mt-6 space-y-6">
        {groupedByClass.size > 0 ? (
          Array.from(groupedByClass.entries()).map(([className, classLearners]) => (
            <section key={className} className="break-inside-avoid">
              <h2 className="border-b border-black pb-1 text-sm font-bold uppercase">{className} ({classLearners.length} learners)</h2>
              <table className="mt-2 w-full text-left text-xs border-collapse border border-gray-400">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-400">
                    <th className="p-2 border-r border-gray-400 w-8 text-center">#</th>
                    <th className="p-2 border-r border-gray-400">Learner Name</th>
                    <th className="p-2 border-r border-gray-400">Assigned Supervisor</th>
                    <th className="p-2 border-r border-gray-400 w-24 text-center">Attendance</th>
                    <th className="p-2 border-r border-gray-400 w-44">Supervisor Signature / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {classLearners.map((learner, idx) => (
                    <tr key={learner.obligationId} className="border-b border-gray-300">
                      <td className="p-2 border-r border-gray-300 text-center font-mono text-[10px]">{idx + 1}</td>
                      <td className="p-2 border-r border-gray-300 font-semibold">{learner.learnerName}</td>
                      <td className="p-2 border-r border-gray-300 text-gray-700">{learner.supervisorName}</td>
                      <td className="p-2 border-r border-gray-300 text-center font-mono">
                        [ &nbsp; ] Attended &nbsp; [ &nbsp; ] Missed
                      </td>
                      <td className="p-2 border-r border-gray-300"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        ) : (
          <div className="py-12 text-center text-sm text-gray-500 border border-dashed border-gray-300 rounded">
            No learners are allocated to this detention session date ({formatDate(sessionDate)}).
          </div>
        )}

        <section className="mt-8 border-t-2 border-black pt-4 break-inside-avoid">
          <h3 className="text-xs font-bold uppercase">Supervisor Sign-off & Session Verification</h3>
          <div className="mt-4 grid grid-cols-2 gap-8 text-xs">
            <div>
              <p className="mb-8 font-semibold">Lead Supervisor Name & Signature:</p>
              <div className="border-b border-black w-3/4"></div>
              <p className="mt-1 text-[10px] text-gray-500">Date: ________________________</p>
            </div>
            <div>
              <p className="mb-8 font-semibold">School Management Verification:</p>
              <div className="border-b border-black w-3/4"></div>
              <p className="mt-1 text-[10px] text-gray-500">Date: ________________________</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
