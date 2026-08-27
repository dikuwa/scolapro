"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  token: z.string().min(20, "Invitation token is missing."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

const acceptSchema = z.object({
  token: z.string().min(20, "Invitation token is missing."),
});

export type InvitationJoinState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

export async function signUpForInvitation(
  _previousState: InvitationJoinState,
  formData: FormData,
): Promise<InvitationJoinState> {
  const parsed = signupSchema.safeParse({
    token: formData.get("token"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data: previewRows, error: previewError } = await supabase.rpc("get_school_invitation_preview", {
    p_token: parsed.data.token,
  });
  const preview = Array.isArray(previewRows) ? previewRows[0] : previewRows;

  if (previewError || !preview || String(preview.email).toLowerCase() !== parsed.data.email.toLowerCase()) {
    return { message: "This invitation is invalid, expired, or belongs to a different email address." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { message: "The account could not be created. If you already have an account, sign in instead." };
  }

  if (!data.session) {
    return {
      success: true,
      message: "Account created. Confirm your email if requested, then sign in and reopen this invitation link to finish joining the school.",
    };
  }

  const { error: acceptError } = await supabase.rpc("accept_school_invitation", {
    p_token: parsed.data.token,
  });

  if (acceptError) {
    return { message: "Your account was created, but the school invitation could not be accepted. Reopen this link while signed in." };
  }

  redirect("/");
}

export async function acceptInvitation(
  _previousState: InvitationJoinState,
  formData: FormData,
): Promise<InvitationJoinState> {
  const parsed = acceptSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { message: "Invitation token is missing or invalid." };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect(`/login?next=${encodeURIComponent(`/join?token=${parsed.data.token}`)}`);
  }

  const { error } = await supabase.rpc("accept_school_invitation", {
    p_token: parsed.data.token,
  });

  if (error) {
    return { message: "This invitation could not be accepted. Confirm that you signed in with the invited email address." };
  }

  redirect("/");
}
