"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export type LoginState = {
  message?: string;
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
};

function safeNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function signIn(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      message: "We could not sign you in with those details. Check your email and password and try again.",
    };
  }

  // A flagged account must finish password rotation before any requested deep link.
  // The request proxy separately guards direct page navigation.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { message: "Your session could not be verified. Sign in again." };
  }
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile || profile.must_change_password !== false) {
    redirect("/password-rotation");
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
