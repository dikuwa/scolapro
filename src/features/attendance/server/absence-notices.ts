import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolAbsenceNotice={id:string;learnerId:string;learnerName:string;admissionNumber:string|null;className:string|null;absenceFrom:string;absenceTo:string;reasonCategory:string;message:string|null;status:string;reviewNote:string|null;createdAt:string;attachments:{id:string;fileName:string}[]};
function one<T>(value:T[]|T|null|undefined):T|null{return (Array.isArray(value)?value[0]:value)??null;}
export async function getSchoolAbsenceNotices(schoolId:string):Promise<SchoolAbsenceNotice[]>{
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.from("guardian_absence_notices").select("id,learner_id,absence_from,absence_to,reason_category,message,status,review_note,created_at,learners(first_names,surname),enrolments(admission_number,register_classes(display_name)),guardian_absence_notice_attachments(id,file_name)").eq("school_id",schoolId).order("created_at",{ascending:false}).limit(200);
  if(error)throw new Error("Unable to load guardian absence notices.");
  return (data??[]).map((row)=>{const learner=one(row.learners);const enrolment=one(row.enrolments);return{id:row.id,learnerId:row.learner_id,learnerName:learner?`${learner.first_names} ${learner.surname}`:"Learner",admissionNumber:enrolment?.admission_number??null,className:one(enrolment?.register_classes)?.display_name??null,absenceFrom:row.absence_from,absenceTo:row.absence_to,reasonCategory:row.reason_category,message:row.message,status:row.status,reviewNote:row.review_note,createdAt:row.created_at,attachments:(row.guardian_absence_notice_attachments??[]).map((item)=>({id:item.id,fileName:item.file_name}))};});
}
