"use server";

import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MarkGridActionState={success?:boolean;message:string};

export type MarkGridInstance={
  id:string;
  subject:string;
  grade:string;
  className:string;
  displayName:string;
  componentName:string;
  componentCode:string;
  rawMax:number|null;
  termNumber:number|null;
  assessmentDate:string|null;
  status:string;
};

export type MarkGridLearner={
  enrolmentId:string;
  learnerId:string;
  name:string;
  currentMark:number|null;
  currentStatus:"absent"|"exempt"|"incomplete"|"withheld"|null;
  currentVersion:string|null;
  calculatedTotal:number|null;
  missing:boolean;
};

export type MarkGridWorkspaceData={
  userId:string;
  tenantId:string;
  schoolId:string;
  canReview:boolean;
  instances:MarkGridInstance[];
  selectedInstanceId:string|null;
  learners:MarkGridLearner[];
  correctionRequests:Array<{id:string;reason:string;status:string;requestedAt:string}>;
};

const text=(form:FormData,key:string)=>String(form.get(key)??"").trim();

async function scope(){
  const context=await getUserContext();
  const membership=context.currentSchoolMembership;
  if(!context.user||!membership||context.platformMemberships.some((item)=>item.roleKey==="platform_support")) return null;
  const allowed=new Set(["school_admin","principal","deputy_principal","hod","teacher","class_teacher"]);
  if(!allowed.has(membership.roleKey)) return null;
  return {context,membership,db:await createSupabaseServerClient()};
}

export async function getMarkGridWorkspace(requestedInstanceId?:string|null):Promise<MarkGridWorkspaceData|null>{
  const current=await scope();
  if(!current) return null;

  const {data:instances}=await current.db.from("assessment_instances")
    .select("id,assessment_scheme_id,assessment_component_id,subject_offering_id,register_class_id,term_number,display_name,assessment_date,raw_max,status")
    .eq("school_id",current.membership.schoolId)
    .in("status",["not_open","open","returned","review","verified","locked"])
    .order("assessment_date",{ascending:false,nullsFirst:false})
    .limit(80);

  const offeringIds=[...new Set((instances??[]).map((row)=>row.subject_offering_id))];
  const classIds=[...new Set((instances??[]).map((row)=>row.register_class_id))];
  const componentIds=[...new Set((instances??[]).map((row)=>row.assessment_component_id).filter(Boolean))] as string[];

  const [{data:offerings},{data:classes},{data:components}]=await Promise.all([
    offeringIds.length?current.db.from("subject_offerings").select("id,subject_id,grade_id").in("id",offeringIds):Promise.resolve({data:[]}),
    classIds.length?current.db.from("register_classes").select("id,display_name").in("id",classIds):Promise.resolve({data:[]}),
    componentIds.length?current.db.from("assessment_components").select("id,component_code,display_name,raw_max,weight,required,contributes_to_report,term_numbers").in("id",componentIds):Promise.resolve({data:[]}),
  ]);
  const subjectIds=[...new Set((offerings??[]).map((row)=>row.subject_id))];
  const gradeIds=[...new Set((offerings??[]).map((row)=>row.grade_id))];
  const [{data:subjects},{data:grades}]=await Promise.all([
    subjectIds.length?current.db.from("subjects").select("id,display_name").in("id",subjectIds):Promise.resolve({data:[]}),
    gradeIds.length?current.db.from("grades").select("id,display_name").in("id",gradeIds):Promise.resolve({data:[]}),
  ]);
  const map=<T extends {id:string}>(rows:T[]|null)=>new Map((rows??[]).map((row)=>[row.id,row]));
  const offeringMap=map(offerings); const classMap=map(classes); const componentMap=map(components);
  const subjectMap=map(subjects); const gradeMap=map(grades);

  const instanceRows:MarkGridInstance[]=(instances??[]).map((row)=>{
    const offering=offeringMap.get(row.subject_offering_id);
    const component=row.assessment_component_id?componentMap.get(row.assessment_component_id):undefined;
    return {
      id:row.id,
      subject:subjectMap.get(offering?.subject_id??"")?.display_name??"Subject",
      grade:gradeMap.get(offering?.grade_id??"")?.display_name??"Grade",
      className:classMap.get(row.register_class_id)?.display_name??"Class",
      displayName:row.display_name,
      componentName:component?.display_name??row.display_name,
      componentCode:component?.component_code??"result",
      rawMax:row.raw_max??component?.raw_max??null,
      termNumber:row.term_number??null,
      assessmentDate:row.assessment_date??null,
      status:row.status,
    };
  });
  const selected=instanceRows.find((row)=>row.id===requestedInstanceId)??instanceRows.find((row)=>["open","returned"].includes(row.status))??instanceRows[0]??null;
  if(!selected) return {userId:current.context.user!.id,tenantId:current.membership.tenantId,schoolId:current.membership.schoolId,canReview:["school_admin","principal","deputy_principal","hod"].includes(current.membership.roleKey),instances:instanceRows,selectedInstanceId:null,learners:[],correctionRequests:[]};

  const raw=(instances??[]).find((row)=>row.id===selected.id)!;
  let enrolmentQuery=current.db.from("enrolments")
    .select("id,learner_id,enrolled_from,enrolled_to,status")
    .eq("school_id",current.membership.schoolId)
    .eq("register_class_id",raw.register_class_id);
  if(raw.assessment_date){
    enrolmentQuery=enrolmentQuery.lte("enrolled_from",raw.assessment_date).or(`enrolled_to.is.null,enrolled_to.gte.${raw.assessment_date}`);
  }else{
    enrolmentQuery=enrolmentQuery.eq("status","current");
  }
  const {data:enrolments}=await enrolmentQuery;
  const learnerIds=(enrolments??[]).map((row)=>row.learner_id);
  const {data:learners}=learnerIds.length
    ? await current.db.from("learners").select("id,first_names,surname").in("id",learnerIds)
    : {data:[]};
  const enrolmentIds=(enrolments??[]).map((row)=>row.id);
  const {data:marks}=enrolmentIds.length
    ? await current.db.from("learner_marks_current")
      .select("id,enrolment_id,learner_id,numeric_mark,mark_status")
      .eq("assessment_instance_id",selected.id)
      .in("enrolment_id",enrolmentIds)
    : {data:[]};

  // Batch-load all contributing component marks for the same scheme/class/term
  // so the grid can show a read-only calculated total without N+1 RPCs.
  const {data:schemeComponents}=await current.db.from("assessment_components")
    .select("id,raw_max,weight,required,contributes_to_report,term_numbers")
    .eq("assessment_scheme_id",raw.assessment_scheme_id)
    .eq("contributes_to_report",true);
  const applicable=(schemeComponents??[]).filter((component)=>!raw.term_number||(component.term_numbers??[1,2,3]).includes(raw.term_number));
  const applicableIds=applicable.map((row)=>row.id);
  const {data:relatedInstances}=applicableIds.length
    ? await current.db.from("assessment_instances")
      .select("id,assessment_component_id,raw_max")
      .eq("assessment_scheme_id",raw.assessment_scheme_id)
      .eq("register_class_id",raw.register_class_id)
      .eq("term_number",raw.term_number)
      .neq("status","cancelled")
      .in("assessment_component_id",applicableIds)
    : {data:[]};
  const relatedIds=(relatedInstances??[]).map((row)=>row.id);
  const {data:relatedMarks}=relatedIds.length&&enrolmentIds.length
    ? await current.db.from("learner_marks_current")
      .select("assessment_instance_id,enrolment_id,numeric_mark,mark_status")
      .in("assessment_instance_id",relatedIds)
      .in("enrolment_id",enrolmentIds)
    : {data:[]};

  const learnerMap=map(learners);
  const currentMarkMap=new Map((marks??[]).map((row)=>[row.enrolment_id,row]));
  const instanceByComponent=new Map((relatedInstances??[]).map((row)=>[row.assessment_component_id,row]));
  const relatedMarkMap=new Map((relatedMarks??[]).map((row)=>[`${row.assessment_instance_id}:${row.enrolment_id}`,row]));

  function calculatedTotal(enrolmentId:string){
    let weighted=0,weightTotal=0;
    for(const component of applicable){
      const instance=instanceByComponent.get(component.id);
      if(!instance) { if(component.required) return null; continue; }
      const mark=relatedMarkMap.get(`${instance.id}:${enrolmentId}`);
      if(!mark||mark.mark_status!=null||mark.numeric_mark==null) { if(component.required) return null; continue; }
      const max=instance.raw_max??component.raw_max;
      if(!max||component.weight==null) return null;
      weighted+=(Number(mark.numeric_mark)/Number(max))*Number(component.weight);
      weightTotal+=Number(component.weight);
    }
    return weightTotal>0?Math.round((weighted/weightTotal)*10000)/100:null;
  }

  const {data:correctionRequests}=await current.db.from("assessment_correction_requests")
    .select("id,reason,status,requested_at")
    .eq("assessment_instance_id",selected.id)
    .order("requested_at",{ascending:false})
    .limit(10);

  return {
    userId:current.context.user!.id,
    tenantId:current.membership.tenantId,
    schoolId:current.membership.schoolId,
    canReview:["school_admin","principal","deputy_principal","hod"].includes(current.membership.roleKey),
    instances:instanceRows,
    selectedInstanceId:selected.id,
    learners:(enrolments??[]).map((enrolment)=>{
      const learner=learnerMap.get(enrolment.learner_id);
      const mark=currentMarkMap.get(enrolment.id);
      return {
        enrolmentId:enrolment.id,
        learnerId:enrolment.learner_id,
        name:[learner?.surname,learner?.first_names].filter(Boolean).join(", ")||"Learner",
        currentMark:mark?.numeric_mark==null?null:Number(mark.numeric_mark),
        currentStatus:(mark?.mark_status??null) as MarkGridLearner["currentStatus"],
        currentVersion:mark?.id??null,
        calculatedTotal:calculatedTotal(enrolment.id),
        missing:!mark|| (mark.numeric_mark==null&&mark.mark_status==null),
      };
    }).sort((a,b)=>a.name.localeCompare(b.name)),
    correctionRequests:(correctionRequests??[]).map((row)=>({
      id:row.id,reason:row.reason,status:row.status,requestedAt:row.requested_at,
    })),
  };
}

export async function submitMarkGridForReview(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState>{
  const current=await scope();
  const assessmentInstanceId=text(form,"assessmentInstanceId");
  if(!current||!assessmentInstanceId) return {message:"Choose an assessment."};
  const {error}=await current.db.rpc("submit_assessment_for_review",{
    p_assessment_instance_id:assessmentInstanceId,
    p_calculation_version:"weighted-v1",
  });
  if(error) return {message:error.message.includes("Marks are incomplete")?"Complete or explicitly status every required learner before submission.":"Assessment could not be submitted for review."};
  revalidatePath("/assessment/marks");
  return {success:true,message:"Assessment submitted to the governed HOD review queue."};
}


export async function requestAssessmentCorrection(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState>{
  const current=await scope();
  if(!current) return {message:"Assessment access is required."};
  const assessmentInstanceId=text(form,"assessmentInstanceId");
  const reason=text(form,"reason");
  if(!assessmentInstanceId||reason.length<3) return {message:"Enter a correction reason."};
  const {error}=await current.db.rpc("request_assessment_correction",{
    p_assessment_instance_id:assessmentInstanceId,
    p_reason:reason,
  });
  if(error) return {message:"Correction request could not be recorded for this assessment."};
  revalidatePath("/assessment/marks");
  return {success:true,message:"Correction request recorded with audit provenance."};
}

export async function reopenAssessmentForCorrection(
  _state:MarkGridActionState,
  form:FormData,
):Promise<MarkGridActionState>{
  const current=await scope();
  if(!current) return {message:"Assessment review authority is required."};
  const requestId=text(form,"requestId");
  if(!requestId) return {message:"Choose a correction request."};
  const {error}=await current.db.rpc("reopen_assessment_for_correction",{
    p_correction_request_id:requestId,
  });
  if(error){
    if(error.message.includes("Locked assessment")) return {message:"This locked assessment already underpins official results and cannot be silently unlocked."};
    return {message:"Assessment could not be reopened under your current review authority."};
  }
  revalidatePath("/assessment/marks");
  return {success:true,message:"Assessment reopened as returned. Corrections must pass through review again."};
}
