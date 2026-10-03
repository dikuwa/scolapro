"use client";

import { useState } from "react";
import { Picker, type PickerOption } from "@/components/ui/picker";
import type { AcademicScheduleBasis, AcademicScheduleType } from "@/features/reporting/server/academic-schedules";

export function AcademicScheduleFilters({ scheduleType, academicYear, termNumber, basis, scheduleOptions }: {
  scheduleType: AcademicScheduleType;
  academicYear: number;
  termNumber: number;
  basis: AcademicScheduleBasis;
  scheduleOptions: PickerOption[];
}) {
  const [typeValue,setTypeValue]=useState(scheduleType);
  const [basisValue,setBasisValue]=useState(basis);
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Picker label="Schedule" name="type" value={typeValue} onChange={(value)=>setTypeValue(value as AcademicScheduleType)} placeholder="Choose schedule" options={scheduleOptions} searchable />
        <label className="text-xs font-medium">Academic year<input name="year" type="number" min="2000" max="2200" defaultValue={academicYear} className="scolapro-control-surface mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm"/></label>
        <label className="text-xs font-medium">Term<input name="term" type="number" min="1" max="6" defaultValue={termNumber} className="scolapro-control-surface mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm"/></label>
        <Picker label="Basis" name="basis" value={basisValue} onChange={(value)=>setBasisValue(value as AcademicScheduleBasis)} placeholder="Choose basis" options={[{value:"official",label:"Official"},{value:"provisional",label:"Provisional preview"}]} />
        <button className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white sm:col-span-2 lg:col-span-4">Refresh preview</button>
      </form>
    </div>
  );
}
