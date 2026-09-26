import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

export type SubjectFileAccessMode = "hod" | "teacher";

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
  const hodResponsibilities=(responsibilities ?? []).filter((row)=>
    ownAssignmentIds.has(row.department_head_staff_assignment_id) && effective(today,row.effective_from,row.effective_to)
  );
  const hodSubjectIds=new Set(hodResponsibilities.map((row)=>row.subject_id));

  const activeAllocations=(teachingAllocations ?? []).filter((row)=>effective(today,row.active_from,row.active_to));
  const ownAllocationIds=activeAllocations.filter((row)=>row.staff_member_id===membership.staffMemberId);
  const offeringIds=[...new Set(activeAllocations.map((row)=>row.subject_offering_id))];

  const {data:offerings,error:offeringError}=offeringIds.length
    ? await db.from("subject_offerings")
        .select("id,subject_id,grade_id,curriculum_version_id")
        .eq("school_id",membership.schoolId)
        .eq("academic_year",academicYear)
        .in("id",offeringIds)
    : {data:[],error:null};
  if (offeringError) throw new Error("Unable to load subject-file offerings.");

  const offeringById=new Map((offerings ?? []).map((row)=>[row.id,row]));
  const teacherSubjectIds=new Set(
    ownAllocationIds.map((row)=>offeringById.get(row.subject_offering_id)?.subject_id).filter((id):id is string=>Boolean(id))
  );
  const allowedSubjectIds=[...new Set([...hodSubjectIds,...teacherSubjectIds])];
  if (!allowedSubjectIds.length) return {schoolId:membership.schoolId,schoolName:membership.schoolName,academicYear,rows:[]};

  const subjectOfferingRows=(offerings ?? []).filter((row)=>allowedSubjectIds.includes(row.subject_id));
  const scopedOfferingIds=subjectOfferingRows.map((row)=>row.id);
  const gradeIds=[...new Set(subjectOfferingRows.map((row)=>row.grade_id))];
  const staffIds=[...new Set(activeAllocations.filter((row)=>scopedOfferingIds.includes(row.subject_offering_id)).map((row)=>row.staff_member_id))];

  const [
    {data:subjects,error:subjectError},
    {data:grades,error:gradeError},
    {data:staff,error:staffError},
    {data:plans,error:planError},
    {data:schedules,error:scheduleError},
    {data:schemes,error:schemeError},
    {data:instances,error:instanceError},
  ]=await Promise.all([
    db.from("subjects").select("id,subject_code,display_name").eq("school_id",membership.schoolId).in("id",allowedSubjectIds),
    gradeIds.length ? db.from("grades").select("id,display_name").in("id",gradeIds) : Promise.resolve({data:[],error:null}),
    staffIds.length ? db.from("staff_members").select("id,first_name,last_name").in("id",staffIds) : Promise.resolve({data:[],error:null}),
    scopedOfferingIds.length ? db.from("pacing_plans").select("id,subject_offering_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear).in("subject_offering_id",scopedOfferingIds) : Promise.resolve({data:[],error:null}),
    db.from("teaching_schedule_items").select("id,teacher_allocation_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear),
    scopedOfferingIds.length ? db.from("assessment_schemes").select("id,subject_offering_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear).in("subject_offering_id",scopedOfferingIds) : Promise.resolve({data:[],error:null}),
    scopedOfferingIds.length ? db.from("assessment_instances").select("id,subject_offering_id,assessment_component_id,status").eq("school_id",membership.schoolId).eq("academic_year",academicYear).in("subject_offering_id",scopedOfferingIds) : Promise.resolve({data:[],error:null}),
  ]);
  if (subjectError || gradeError || staffError || planError || scheduleError || schemeError || instanceError) {
    throw new Error("Unable to assemble the governed subject dossier.");
  }

  const scheduleIds=(schedules ?? []).filter((row)=>{
    const allocation=activeAllocations.find((item)=>item.id===row.teacher_allocation_id);
    return Boolean(allocation && scopedOfferingIds.includes(allocation.subject_offering_id));
  }).map((row)=>row.id);
  const {data:preparations,error:preparationError}=scheduleIds.length
    ? await db.from("lesson_preparations").select("id,teaching_schedule_item_id,status").in("teaching_schedule_item_id",scheduleIds)
    : {data:[],error:null};
  if (preparationError) throw new Error("Unable to load subject-file preparation evidence.");

  const componentIds=[...new Set((instances ?? []).map((row)=>row.assessment_component_id).filter((id):id is string=>Boolean(id)))];
  const {data:components,error:componentError}=componentIds.length
    ? await db.from("assessment_components").select("id,moderation_required").in("id",componentIds)
    : {data:[],error:null};
  if (componentError) throw new Error("Unable to load subject-file moderation evidence.");

  const subjectMap=new Map((subjects ?? []).map((row)=>[row.id,row]));
  const gradeMap=new Map((grades ?? []).map((row)=>[row.id,row.display_name]));
  const staffMap=new Map((staff ?? []).map((row)=>[row.id,`${row.first_name} ${row.last_name}`.trim()]));
  const moderationByComponent=new Map((components ?? []).map((row)=>[row.id,row.moderation_required]));
  const preparationScheduleIds=new Set((preparations ?? []).map((row)=>row.teaching_schedule_item_id));

  const rows:SubjectFileRow[]=allowedSubjectIds.flatMap((subjectId)=>{
    const subject=subjectMap.get(subjectId);
    if (!subject) return [];
    const subjectOfferings=subjectOfferingRows.filter((row)=>row.subject_id===subjectId);
    const ids=new Set(subjectOfferings.map((row)=>row.id));
    const allocationsForSubject=activeAllocations.filter((row)=>ids.has(row.subject_offering_id));
    const allocationIdSet=new Set(allocationsForSubject.map((row)=>row.id));
    const scheduleRows=(schedules ?? []).filter((row)=>allocationIdSet.has(row.teacher_allocation_id));
    const schemeRows=(schemes ?? []).filter((row)=>ids.has(row.subject_offering_id));
    const instanceRows=(instances ?? []).filter((row)=>ids.has(row.subject_offering_id));
    const responsibility=hodResponsibilities.find((row)=>row.subject_id===subjectId);

    return [{
      subjectId,
      subjectCode:subject.subject_code,
      subjectName:subject.display_name,
      departmentLabel:responsibility?.department_label ?? null,
      accessMode:hodSubjectIds.has(subjectId) ? "hod" : "teacher",
      teacherNames:[...new Set(allocationsForSubject.map((row)=>staffMap.get(row.staff_member_id)).filter((name):name is string=>Boolean(name)))].sort(),
      gradeNames:[...new Set(subjectOfferings.map((row)=>gradeMap.get(row.grade_id)).filter((name):name is string=>Boolean(name)))].sort(),
      allocationCount:allocationsForSubject.length,
      planningCount:(plans ?? []).filter((row)=>ids.has(row.subject_offering_id)).length,
      scheduledLessonCount:scheduleRows.length,
      preparationCount:scheduleRows.filter((row)=>preparationScheduleIds.has(row.id)).length,
      assessmentSchemeCount:schemeRows.length,
      assessmentInstanceCount:instanceRows.length,
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
        "Department minutes/circulars/resources have no canonical subject-linked repository model yet; no parallel file store is fabricated here.",
        "Inventory is school/room scoped; no subject-to-room ownership is inferred.",
      ],
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
