"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export type AbsenceReviewState={success?:boolean;message?:string};
export async function reviewAbsenceNotice(_state:AbsenceReviewState,formData:FormData):Promise<AbsenceReviewState>{const parsed=z.object({noticeId:z.string().uuid(),status:z.enum(["under_review","accepted","returned","closed"]),note:z.string().trim().max(1000).optional()}).safeParse({noticeId:formData.get("noticeId"),status:formData.get("status"),note:String(formData.get("note")??"")});if(!parsed.success)return{message:"Choose a valid review decision."};const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("review_guardian_absence_notice",{p_notice_id:parsed.data.noticeId,p_status:parsed.data.status,p_review_note:parsed.data.note||null});if(error)return{message:error.message};revalidatePath("/attendance/absence-notices");revalidatePath("/parent");return{success:true,message:"Absence notice review saved."};}
