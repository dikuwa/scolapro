"use client";

import { useState } from "react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type FilterOptions = {
  grades: string[];
  classes: string[];
  subjects: Array<{ value: string; label: string; helper?: string }>;
  teachers: string[];
};

function options(values: string[]): SearchableSelectOption[] {
  return values.map((value) => ({ value, label: value }));
}

export function AcademicAnalysisFilters({
  year,
  term,
  basis,
  grade,
  className,
  subject,
  teacher,
  options: available,
}: {
  year: number;
  term: number;
  basis: "official" | "provisional";
  grade: string;
  className: string;
  subject: string;
  teacher: string;
  options: FilterOptions;
}) {
  const [selectedTerm, setSelectedTerm] = useState(String(term));
  const [selectedBasis, setSelectedBasis] = useState(basis);
  const [selectedGrade, setSelectedGrade] = useState(grade);
  const [selectedClass, setSelectedClass] = useState(className);
  const [selectedSubject, setSelectedSubject] = useState(subject);
  const [selectedTeacher, setSelectedTeacher] = useState(teacher);

  return (
    <form className="grid gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <label className="text-xs font-medium">
        Year
        <input
          name="year"
          defaultValue={year}
          inputMode="numeric"
          className="scolapro-control-surface mt-1 min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm outline-none focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]"
        />
      </label>

      <SearchableSelect
        label="Term"
        name="term"
        value={selectedTerm}
        onChange={setSelectedTerm}
        options={[1, 2, 3].map((value) => ({ value: String(value), label: `Term ${value}` }))}
        placeholder="Select term"
        searchPlaceholder="Search terms…"
      />

      <SearchableSelect
        label="Basis"
        name="basis"
        value={selectedBasis}
        onChange={(value) => setSelectedBasis(value === "provisional" ? "provisional" : "official")}
        options={[
          { value: "official", label: "Official" },
          { value: "provisional", label: "Provisional" },
        ]}
        placeholder="Select basis"
        searchPlaceholder="Search basis…"
      />

      <SearchableSelect
        label="Grade"
        name="grade"
        value={selectedGrade}
        onChange={setSelectedGrade}
        options={options(available.grades)}
        placeholder="All grades"
        searchPlaceholder="Search grades…"
        clearable
        onClear={() => setSelectedGrade("")}
      />

      <SearchableSelect
        label="Class"
        name="class"
        value={selectedClass}
        onChange={setSelectedClass}
        options={options(available.classes)}
        placeholder="All classes"
        searchPlaceholder="Search classes…"
        clearable
        onClear={() => setSelectedClass("")}
      />

      <SearchableSelect
        label="Subject"
        name="subject"
        value={selectedSubject}
        onChange={setSelectedSubject}
        options={available.subjects}
        placeholder="All subjects"
        searchPlaceholder="Search subjects…"
        clearable
        onClear={() => setSelectedSubject("")}
      />

      <SearchableSelect
        label="Teacher"
        name="teacher"
        value={selectedTeacher}
        onChange={setSelectedTeacher}
        options={options(available.teachers)}
        placeholder="All teachers"
        searchPlaceholder="Search teachers…"
        clearable
        onClear={() => setSelectedTeacher("")}
      />

      <div className="flex items-end gap-2">
        <button className="min-h-10 rounded-[var(--radius-xs)] bg-brand px-4 text-sm font-medium text-white">Apply</button>
        <a href="/academics/analysis" className="min-h-10 rounded-[var(--radius-xs)] border border-border px-4 py-2 text-sm">Clear</a>
      </div>
    </form>
  );
}
