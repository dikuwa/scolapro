import { redirect } from "next/navigation";
import { DocumentPrintButton } from "@/components/documents/document-print-button";
import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_FRAME_RULE,
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { getDetentionPlanning } from "@/features/late-arrivals/server/planning-queries";
import { getUserContext } from "@/lib/auth/get-user-context";

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

  const [planning, header] = await Promise.all([
    getDetentionPlanning(schoolId, today),
    getLiveSchoolDocumentHeader(schoolId, officialDocumentHeaderModeForType("detention_roster")),
  ]);

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

  const headerHtml = renderOfficialDocumentHtmlHeader(header, undefined, {
    context: {
      title: "Detention Register",
      primaryContext: formatDate(sessionDate),
      secondaryContext: targetSession?.location || "Designated Detention Room",
      summary: `${assignments.length} learner${assignments.length === 1 ? "" : "s"}`,
    },
  });
  const footerHtml = renderOfficialDocumentHtmlFooter({
    left: `Generated ${new Intl.DateTimeFormat("en-NA", { timeZone: "Africa/Windhoek", day: "2-digit", month: "short", year: "numeric" }).format(new Date())}`,
    right: "Detention roster",
  });

  return (
    <div className="min-h-screen bg-slate-100 p-3 text-black print:bg-white print:p-0 sm:p-6">
      <style>{`
        ${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
        :root { --line:#4a4a4a; }
        ${OFFICIAL_DOCUMENT_FRAME_RULE}
        ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
        ${OFFICIAL_DOCUMENT_METADATA_RULE}
        .report { max-width:210mm; margin:0 auto; background:#fff; box-shadow:0 14px 36px rgba(20,28,40,.12); }
        @media print {
          .no-print { display:none !important; }
          body { background:white !important; color:black !important; }
          .report { max-width:none; margin:0; box-shadow:none; }
          ${OFFICIAL_DOCUMENT_PRINT_RULE}
        }
      `}</style>

      <div className="no-print mx-auto mb-3 flex w-full max-w-[210mm] items-center justify-between gap-4 rounded-md border bg-background p-3 text-foreground shadow-sm">
        <div>
          <h1 className="text-sm font-bold">Detention Register</h1>
          <p className="text-xs text-muted-foreground">Print-ready attendance and outcome roster.</p>
        </div>
        <DocumentPrintButton label="Print Roster" />
      </div>

      <main className="report text-black">
        <div dangerouslySetInnerHTML={{ __html: headerHtml }} />

        <section className="mt-4 grid grid-cols-3 gap-4 border-y border-gray-300 py-3 text-xs">
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
        </section>

        <div className="mt-6 space-y-6">
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
        </div>
        <div dangerouslySetInnerHTML={{ __html: footerHtml }} />
      </main>
    </div>
  );
}
