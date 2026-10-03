import { redirect } from "next/navigation";
import { PrintApplicationButton } from "@/features/admissions/print-application-button";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function BlankAdmissionApplicationPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships.find((item) => managerRoles.has(item.roleKey));
  if (!membership) redirect("/");

  return (
    <main className="mx-auto min-h-screen max-w-[210mm] bg-white p-8 text-black print:p-0">
      <div className="mb-5 flex items-start justify-between gap-4 print:hidden"><a href="/school/admissions" className="text-sm font-semibold text-black">← Admissions</a><PrintApplicationButton /></div>
      <header className="border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-bold">{membership.schoolName}</h1>
        <p className="mt-1 text-sm">Learner Application · {getNamibiaCalendarYear()}</p>
      </header>
      <section className="mt-5 space-y-5 text-sm">
        <FormSection title="Learner">
          <Line label="Surname" /><Line label="First names" /><Line label="Preferred name" /><Line label="Date of birth" /><Line label="Sex" /><Line label="Citizenship" /><Line label="Home language" /><Line label="Current / previous school" /><Line label="Current / last grade" /><Line label="Intended grade / year" />
        </FormSection>
        <div className="grid grid-cols-2 gap-5">
          <FormSection title="Guardian 1"><Line label="Name" /><Line label="Relationship" /><Line label="Contact" /></FormSection>
          <FormSection title="Guardian 2"><Line label="Name" /><Line label="Relationship" /><Line label="Contact" /></FormSection>
        </div>
        <FormSection title="Other"><Line label="Siblings at school (optional)" /><Line label="Declarations / relevant notes" /></FormSection>
        <FormSection title="Document checklist"><Checklist items={["Birth certificate","Passport / photo / ID","Previous report","Transfer / support documents","Other school-required document"]} /></FormSection>
        <div className="grid grid-cols-2 gap-8 pt-4"><Line label="Guardian signature" /><Line label="Date" /></div>
      </section>
      <p className="mt-6 text-[10px] leading-4">Submission of this form creates an application only. Admission and enrolment are subject to school review and the governed admissions process.</p>
    </main>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-wide">{title}</h2><div className="space-y-3">{children}</div></section>;
}
function Line({ label }: { label: string }) { return <div className="flex items-end gap-2"><span className="shrink-0 text-xs font-semibold">{label}:</span><span className="h-5 flex-1 border-b border-black" /></div>; }
function Checklist({ items }: { items: string[] }) { return <div className="grid grid-cols-2 gap-x-6 gap-y-2">{items.map((item) => <span key={item}>□ {item}</span>)}</div>; }
