import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { resolveOperationalFileTemplate } from "@/features/teaching/server/operational-file-templates";
import { getOperationalFileSharedResourceReferences } from "@/features/teaching/server/operational-file-shared-resources";

export type SubjectFileAccessMode = "hod" | "teacher";

export type SubjectFilePolicyItem = {
  id: string;
  itemKey: string;
  label: string;
  resolverType: string;
  status: "resolved" | "missing" | "unavailable" | "manual" | "external";
  references: Array<{
    id: string;
    label: string;
    href: string;
    sourceModule: string;
    authorityLabel?: string;
    provider?: string;
  }>;
  reason: string | null;
};

export type SubjectFilePolicySection = {
  id: string;
  title: string;
  sequenceNumber: number;
  items: SubjectFilePolicyItem[];
};

export type SubjectFilePolicyHierarchy = {
  templateId: string;
  sourceTitle: string;
  authority: string;
  templateVersion: number;
  phaseLabels: string[];
  sections: SubjectFilePolicySection[];
};

export type SubjectFileRow = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  departmentLabel: string | null;
  accessMode: SubjectFileAccessMode;
  teacherNames: string[];
  gradeNames: string[];
  allocationCount: number;
  planningCount: number;
  scheduledLessonCount: number;
  preparationCount: number;
  assessmentSchemeCount: number;
  assessmentInstanceCount: number;
  moderationRequiredCount: number;
  sourceLinks: Array<{ label: string; href: string; description: string }>;
  unavailableSources: string[];
  policyHierarchy: SubjectFilePolicyHierarchy | null;
  policyHierarchyReason: string | null;
};

export type SubjectFileWorkspace = {
  schoolId: string;
  schoolName: string;
  academicYear: number;
  rows: SubjectFileRow[];
};

function effective(date:string,from:string,to:string|null) {
  return from<=date && (!to || to>=date);
}

const SUBJECT_FILE_PAGE_SIZE=1000;

async function loadAllScheduleRows(
  db:Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId:string,
  academicYear:number,
) {
  const rows:Array<{id:string;teacher_allocation_id:string;status:string}>=[];
  for (let from=0;;from+=SUBJECT_FILE_PAGE_SIZE) {
    const {data,error}=await db.from("teaching_schedule_items")
      .select("id,teacher_allocation_id,status")
      .eq("school_id",schoolId)
      .eq("academic_year",academicYear)
      .range(from,from+SUBJECT_FILE_PAGE_SIZE-1);
    if (error) throw new Error("Unable to load subject-file schedule evidence.");
    const page=data ?? [];
    rows.push(...page);
    if (page.length<SUBJECT_FILE_PAGE_SIZE) break;
  }
  return rows;
}

async function loadAllPreparationRows(
  db:Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId:string,
  academicYear:number,
) {
  const rows:Array<{id:string;teaching_schedule_item_id:string;status:string}>=[];
  for (let from=0;;from+=SUBJECT_FILE_PAGE_SIZE) {
    const {data,error}=await db.from("lesson_preparations")
      .select("id,teaching_schedule_item_id,status")
      .eq("school_id",schoolId)
      .eq("academic_year",academicYear)
      .range(from,from+SUBJECT_FILE_PAGE_SIZE-1);
    if (error) throw new Error("Unable to load subject-file preparation evidence.");
    const page=data ?? [];
    rows.push(...page);
    if (page.length<SUBJECT_FILE_PAGE_SIZE) break;
  }
  return rows;
}


function normalizeSubject(value:string) {
  return value.trim().toLocaleLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}

function gradeNumber(value:string) {
  const match=value.match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const grade=Number(match[1]);
  return Number.isInteger(grade) && grade>=0 && grade<=20 ? grade : null;
}

function policyReference(
  id:string,
  label:string,
  href:string,
  sourceModule:string,
):SubjectFilePolicyItem["references"][number] {
  return {id,label,href,sourceModule};
}

async function loadSubjectPolicyHierarchy(input:{
  subjectName:string;
  subjectId:string;
  gradeNames:string[];
  academicYear:number;
  today:string;
  allocationCount:number;
  planningCount:number;
  preparationCount:number;
  assessmentSchemeCount:number;
  assessmentInstanceCount:number;
  teacherCount:number;
}):Promise<{hierarchy:SubjectFilePolicyHierarchy|null;reason:string|null}> {
  if (normalizeSubject(input.subjectName)!=="information and communication") {
    return {
      hierarchy:null,
      reason:"No authoritative Subject File hierarchy is recorded for this subject. ScolaPro does not reuse the Information & Communication taxonomy for unrelated subjects.",
    };
  }

  const grades=input.gradeNames.map(gradeNumber).filter((grade):grade is number=>grade!==null);
  if (!grades.length) {
    return {hierarchy:null,reason:"No current grade could be matched to the authoritative Subject File template."};
  }

  const resolved=await Promise.all(grades.map((grade)=>resolveOperationalFileTemplate({
    subjectKey:"information-communication",
    grade,
    effectiveOn:input.today,
  })));
  const template=resolved.find((item)=>item!==null) ?? null;
  if (!template) {
    return {hierarchy:null,reason:"No effective authoritative Subject File template is available for this subject and grade scope."};
  }

  const subjectFile=template.fileTypes.find((item)=>item.fileTypeKey==="subject");
  if (!subjectFile) {
    return {hierarchy:null,reason:"The active policy template does not define a Subject File."};
  }

  const itemIds=subjectFile.sections.flatMap((section)=>section.items.map((item)=>item.id));
  const sharedByItem=await getOperationalFileSharedResourceReferences({
    templateItemIds:itemIds,
    academicYear:input.academicYear,
    effectiveOn:input.today,
  });

  const canonical=(resolverType:string):SubjectFilePolicyItem["references"]=>{
    switch(resolverType) {
      case "curriculum":
        return [policyReference("curriculum","Curriculum / syllabus","/teaching/curriculum","Curriculum")];
      case "scheme":
        return input.planningCount>0
          ? [policyReference("scheme","Year Planner & Scheme","/teaching/planning","Teaching Planning")]
          : [];
      case "staff_profile":
        return input.teacherCount>0
          ? [policyReference("teaching-team","Teaching team & allocations","/teaching/subject-file","Subject File")]
          : [];
      default:
        return [];
    }
  };

  const phaseLabels=template.phases
    .filter((phase)=>grades.some((grade)=>
      (phase.gradeFrom===null || grade>=phase.gradeFrom) &&
      (phase.gradeTo===null || grade<=phase.gradeTo)
    ))
    .map((phase)=>phase.phaseLabel);

  return {
    hierarchy:{
      templateId:template.id,
      sourceTitle:template.sourceTitle,
      authority:template.authority,
      templateVersion:template.templateVersion,
      phaseLabels:[...new Set(phaseLabels)],
      sections:subjectFile.sections.map((section)=>({
        id:section.id,
        title:section.title,
        sequenceNumber:section.sequenceNumber,
        items:section.items.map((item)=>{
          const shared=(sharedByItem.get(item.id) ?? []).map((resource)=>({
            id:resource.id,
            label:resource.title,
            href:resource.externalUrl ?? "",
            sourceModule:
              resource.scopeType==="national" ? "National resource"
              : resource.scopeType==="school" ? "School resource"
              : resource.scopeType==="subject_phase" ? "Subject resource"
              : "Teacher resource",
            authorityLabel:resource.authorityLabel,
            provider:resource.provider,
          })).filter((reference)=>Boolean(reference.href));

          if (item.resolverType==="shared_resource" || item.resolverType==="external_link") {
            return {
              id:item.id,
              itemKey:item.itemKey,
              label:item.label,
              resolverType:item.resolverType,
              status:shared.length ? (item.resolverType==="external_link" ? "external" : "resolved") : "missing",
              references:shared,
              reason:shared.length ? null : "No applicable governed shared resource or external reference is recorded.",
            } satisfies SubjectFilePolicyItem;
          }

          if (item.resolverType==="manual") {
            return {
              id:item.id,itemKey:item.itemKey,label:item.label,resolverType:item.resolverType,
              status:"manual",references:[],reason:"This requirement is policy-defined but intentionally has no canonical resolver.",
            } satisfies SubjectFilePolicyItem;
          }

          if (item.resolverType==="teacher_document") {
            return {
              id:item.id,itemKey:item.itemKey,label:item.label,resolverType:item.resolverType,
              status:"unavailable",references:[],
              reason:"Private teacher evidence is not exposed through the shared Subject File. Existing Professional File Review remains authoritative.",
            } satisfies SubjectFilePolicyItem;
          }

          if (item.resolverType==="room_inventory") {
            return {
              id:item.id,itemKey:item.itemKey,label:item.label,resolverType:item.resolverType,
              status:"unavailable",references:[],
              reason:"Room Inventory is school/room scoped; ScolaPro does not infer a subject-to-room relationship.",
            } satisfies SubjectFilePolicyItem;
          }

          if (item.resolverType==="results") {
            return {
              id:item.id,itemKey:item.itemKey,label:item.label,resolverType:item.resolverType,
              status:"unavailable",references:[],
              reason:"A governed Subject File resolver for historical promotion results is not proven yet.",
            } satisfies SubjectFilePolicyItem;
          }

          const references=canonical(item.resolverType);
          return {
            id:item.id,
            itemKey:item.itemKey,
            label:item.label,
            resolverType:item.resolverType,
            status:references.length ? "resolved" : "missing",
            references,
            reason:references.length ? null : "No canonical evidence is available in the current subject scope.",
          } satisfies SubjectFilePolicyItem;
        }),
      })),
    },
    reason:null,
  };
}

export async function getSubjectFileWorkspace(academicYear:number):Promise<SubjectFileWorkspace|null> {
  const context=await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership=context.currentSchoolMembership;
  if (!membership?.staffMemberId || !["hod","teacher","class_teacher"].includes(membership.roleKey)) return null;

  const db=await createSupabaseServerClient();
  const today=getNamibiaDateKey();

  const [{data:assignments,error:assignmentError},{data:responsibilities,error:responsibilityError},{data:teachingAllocations,error:allocationError}] = await Promise.all([
    db.from("staff_school_assignments")
      .select("id,staff_member_id,effective_from,effective_to")
      .eq("school_id",membership.schoolId)
      .eq("staff_member_id",membership.staffMemberId),
    db.from("subject_department_responsibilities")
      .select("id,subject_id,department_head_staff_assignment_id,department_label,effective_from,effective_to")
      .eq("school_id",membership.schoolId),
    db.from("teacher_allocations")
      .select("id,subject_offering_id,register_class_id,staff_member_id,active_from,active_to")
      .eq("school_id",membership.schoolId)
      .eq("academic_year",academicYear),
  ]);
  if (assignmentError || responsibilityError || allocationError) throw new Error("Unable to load governed subject-file scope.");

  const ownAssignmentIds=new Set((assignments ?? []).filter((row)=>effective(today,row.effective_from,row.effective_to)).map((row)=>row.id));
  const hodResponsibilities=membership.roleKey==="hod"
    ? (responsibilities ?? []).filter((row)=>
        ownAssignmentIds.has(row.department_head_staff_assignment_id) && effective(today,row.effective_from,row.effective_to)
      )
    : [];
  const hodSubjectIds=new Set(hodResponsibilities.map((row)=>row.subject_id));

  const activeAllocations=(teachingAllocations ?? []).filter((row)=>effective(today,row.active_from,row.active_to));
  const ownAllocationIds=activeAllocations.filter((row)=>row.staff_member_id===membership.staffMemberId);
  const allocationOfferingIds=[...new Set(activeAllocations.map((row)=>row.subject_offering_id))];

  const {data:allocationOfferings,error:allocationOfferingError}=allocationOfferingIds.length
    ? await db.from("subject_offerings")
        .select("id,subject_id,grade_id,curriculum_version_id")
        .eq("school_id",membership.schoolId)
        .eq("academic_year",academicYear)
        .in("id",allocationOfferingIds)
    : {data:[],error:null};
  if (allocationOfferingError) throw new Error("Unable to load subject-file allocation offerings.");

  const offeringById=new Map((allocationOfferings ?? []).map((row)=>[row.id,row]));
  const teacherSubjectIds=new Set(
    ownAllocationIds.map((row)=>offeringById.get(row.subject_offering_id)?.subject_id).filter((id):id is string=>Boolean(id))
  );
  const allowedSubjectIds=[...new Set([...hodSubjectIds,...teacherSubjectIds])];
  if (!allowedSubjectIds.length) return {schoolId:membership.schoolId,schoolName:membership.schoolName,academicYear,rows:[]};

  const {data:subjectOfferingRows,error:offeringError}=await db.from("subject_offerings")
    .select("id,subject_id,grade_id,curriculum_version_id")
    .eq("school_id",membership.schoolId)
    .eq("academic_year",academicYear)
    .in("subject_id",allowedSubjectIds);
  if (offeringError) throw new Error("Unable to load subject-file offerings.");
  const scopedOfferingIds=subjectOfferingRows.map((row)=>row.id);
  const gradeIds=[...new Set(subjectOfferingRows.map((row)=>row.grade_id))];
  const staffIds=[...new Set(activeAllocations.filter((row)=>scopedOfferingIds.includes(row.subject_offering_id)).map((row)=>row.staff_member_id))];

  const [
    {data:subjects,error:subjectError},
    {data:grades,error:gradeError},
    {data:staff,error:staffError},
    {data:plans,error:planError},
    {data:schemes,error:schemeError},
    {data:instances,error:instanceError},
    schedules,
    preparations,
  ]=await Promise.all([
    db.from("subjects").select("id,subject_code,display_name").eq("school_id",membership.schoolId).in("id",allowedSubjectIds),
    gradeIds.length ? db.from("grades").select("id,display_name").in("id",gradeIds) : Promise.resolve({data:[],error:null}),
    staffIds.length ? db.from("staff_members").select("id,first_name,last_name").in("id",staffIds) : Promise.resolve({data:[],error:null}),
    scopedOfferingIds.length ? db.from("pacing_plans").select("id,subject_offering_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear).in("subject_offering_id",scopedOfferingIds) : Promise.resolve({data:[],error:null}),
    scopedOfferingIds.length ? db.from("assessment_schemes").select("id,subject_offering_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear).in("subject_offering_id",scopedOfferingIds) : Promise.resolve({data:[],error:null}),
    scopedOfferingIds.length ? db.from("assessment_instances").select("id,subject_offering_id,assessment_component_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear).in("subject_offering_id",scopedOfferingIds) : Promise.resolve({data:[],error:null}),
    loadAllScheduleRows(db,membership.schoolId,academicYear),
    loadAllPreparationRows(db,membership.schoolId,academicYear),
  ]);
  if (subjectError || gradeError || staffError || planError || schemeError || instanceError) {
    throw new Error("Unable to assemble the governed subject dossier.");
  }

  const scheduleIds=schedules.filter((row)=>{
    const allocation=activeAllocations.find((item)=>item.id===row.teacher_allocation_id);
    return Boolean(allocation && scopedOfferingIds.includes(allocation.subject_offering_id));
  }).map((row)=>row.id);
  const scheduleIdSet=new Set(scheduleIds);
  const scopedPreparations=preparations.filter((row)=>scheduleIdSet.has(row.teaching_schedule_item_id));

  const componentIds=[...new Set((instances ?? []).map((row)=>row.assessment_component_id).filter((id):id is string=>Boolean(id)))];
  const {data:components,error:componentError}=componentIds.length
    ? await db.from("assessment_components").select("id,moderation_required").in("id",componentIds)
    : {data:[],error:null};
  if (componentError) throw new Error("Unable to load subject-file moderation evidence.");

  const subjectMap=new Map((subjects ?? []).map((row)=>[row.id,row]));
  const gradeMap=new Map((grades ?? []).map((row)=>[row.id,row.display_name]));
  const staffMap=new Map((staff ?? []).map((row)=>[row.id,`${row.first_name} ${row.last_name}`.trim()]));
  const moderationByComponent=new Map((components ?? []).map((row)=>[row.id,row.moderation_required]));
  const preparationScheduleIds=new Set(scopedPreparations.map((row)=>row.teaching_schedule_item_id));

  const rows:SubjectFileRow[]=allowedSubjectIds.flatMap((subjectId)=>{
    const subject=subjectMap.get(subjectId);
    if (!subject) return [];
    const subjectOfferings=subjectOfferingRows.filter((row)=>row.subject_id===subjectId);
    const ids=new Set(subjectOfferings.map((row)=>row.id));
    const allocationsForSubject=activeAllocations.filter((row)=>ids.has(row.subject_offering_id));
    const allocationIdSet=new Set(allocationsForSubject.map((row)=>row.id));
    const scheduleRows=schedules.filter((row)=>allocationIdSet.has(row.teacher_allocation_id));
    const schemeRows=(schemes ?? []).filter((row)=>ids.has(row.subject_offering_id));
    const instanceRows=(instances ?? []).filter((row)=>ids.has(row.subject_offering_id));
    const responsibility=hodResponsibilities.find((row)=>row.subject_id===subjectId);

    const teacherNames=[...new Set(allocationsForSubject.map((row)=>staffMap.get(row.staff_member_id)).filter((name):name is string=>Boolean(name)))].sort();
    const gradeNames=[...new Set(subjectOfferings.map((row)=>gradeMap.get(row.grade_id)).filter((name):name is string=>Boolean(name)))].sort();
    const planningCount=(plans ?? []).filter((row)=>ids.has(row.subject_offering_id)).length;
    const preparationCount=scheduleRows.filter((row)=>preparationScheduleIds.has(row.id)).length;
    const assessmentSchemeCount=schemeRows.length;
    const assessmentInstanceCount=instanceRows.length;
    const policy=await loadSubjectPolicyHierarchy({
      subjectName:subject.display_name,
      subjectId,
      gradeNames,
      academicYear,
      today,
      allocationCount:allocationsForSubject.length,
      planningCount,
      preparationCount,
      assessmentSchemeCount,
      assessmentInstanceCount,
      teacherCount:teacherNames.length,
    });

    return [{
      subjectId,
      subjectCode:subject.subject_code,
      subjectName:subject.display_name,
      departmentLabel:responsibility?.department_label ?? null,
      accessMode:(hodSubjectIds.has(subjectId) ? "hod" : "teacher") as SubjectFileAccessMode,
      teacherNames,
      gradeNames,
      allocationCount:allocationsForSubject.length,
      planningCount,
      scheduledLessonCount:scheduleRows.length,
      preparationCount,
      assessmentSchemeCount,
      assessmentInstanceCount,
      moderationRequiredCount:instanceRows.filter((row)=>row.assessment_component_id && moderationByComponent.get(row.assessment_component_id)).length,
      sourceLinks:[
        {label:"Curriculum / syllabus",href:"/teaching/curriculum",description:"Authoritative curriculum registry and syllabus context."},
        {label:"Teaching team & timetable",href:"/timetable",description:"Current allocations and timetable source."},
        {label:"Year Planner & Scheme",href:"/teaching/planning",description:"Canonical teaching plan views."},
        {label:"Lesson Preparations",href:"/teaching/preparation",description:"Teacher-owned preparation and review evidence."},
        {label:"Assessment",href:"/assessment",description:"Assessment scheme, mark and moderation lifecycle."},
        {label:"Class Lists",href:"/class-lists",description:"Governed roster and export source."},
        {label:"Room Inventory",href:"/school/room-inventory",description:"School inventory source where subject facilities overlap."},
      ],
      unavailableSources:[
        policy.reason ?? "Policy hierarchy is source-grounded; unresolved requirements remain explicit.",
        "Inventory is school/room scoped; no subject-to-room ownership is inferred.",
      ],
      policyHierarchy:policy.hierarchy,
      policyHierarchyReason:policy.reason,
    }];
  }).sort((a,b)=>a.subjectName.localeCompare(b.subjectName));

  return {schoolId:membership.schoolId,schoolName:membership.schoolName,academicYear,rows};
}

export async function getSubjectFileRow(academicYear:number,subjectId:string):Promise<{workspace:SubjectFileWorkspace;row:SubjectFileRow}|null> {
  const workspace=await getSubjectFileWorkspace(academicYear);
  if (!workspace) return null;
  const row=workspace.rows.find((item)=>item.subjectId===subjectId);
  return row ? {workspace,row} : null;
}
