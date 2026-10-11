import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authorizeStaffCredentialPreflight } from "@/features/staff/server/temporary-credential-authorization";
import {
  fingerprintStaffTemporaryPassword,
  generateStaffTemporaryPassword,
} from "@/features/staff/server/temporary-password";

const TEMPORARY_CREDENTIAL_TTL_MS = 60 * 60 * 1000;

type IssuedTemporaryCredential = {
  success: true;
  password: string;
  expiresAt: string;
};

type FailedTemporaryCredential = {
  success: false;
  message: string;
};

type AttemptRow = {
  target_user_id: string;
};

type SecurityProfileRow = {
  user_id: string;
  must_change_password: boolean | null;
  password_rotation_expires_at: string | null;
};

async function finalizeFailedAttempt(attemptId: string) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.rpc("finalize_staff_credential_issuance", {
      p_attempt_id: attemptId,
      p_outcome: "failed",
      p_credential_fingerprint: null,
      p_credential_expires_at: null,
    });
  } catch {
    // Keep the caller fail-closed. The reserved ledger row remains evidence
    // when even the service-only finalizer is unavailable.
  }
}

export async function issueStaffTemporaryCredential(
  schoolId: string,
  staffMemberId: string,
): Promise<IssuedTemporaryCredential | FailedTemporaryCredential> {
  const preflight = await authorizeStaffCredentialPreflight(schoolId, staffMemberId);
  if (!preflight.allowed) {
    return { success: false, message: "Temporary credential issuance is not authorized." };
  }

  const admin = createSupabaseAdminClient();
  let attemptId: string | null = null;
  let authPasswordChanged = false;

  try {
    const { data: reservedAttemptId, error: reserveError } = await admin.rpc(
      "reserve_staff_credential_issuance",
      {
        p_school_id: schoolId,
        p_staff_member_id: staffMemberId,
        p_actor_user_id: preflight.actorUserId,
      },
    );
    if (reserveError || typeof reservedAttemptId !== "string") {
      return { success: false, message: "Temporary credential issuance is not available for this staff account." };
    }
    attemptId = reservedAttemptId;

    // Read only the non-secret target captured by the atomic reservation.
    // This avoids trusting a second staff-member lookup after authorization.
    const { data: attempt, error: attemptError } = await admin
      .from("staff_credential_issuance_attempts")
      .select("target_user_id")
      .eq("id", attemptId)
      .eq("school_id", schoolId)
      .eq("staff_member_id", staffMemberId)
      .eq("actor_user_id", preflight.actorUserId)
      .maybeSingle();
    const reserved = attempt as AttemptRow | null;
    if (attemptError || !reserved?.target_user_id) {
      await finalizeFailedAttempt(attemptId);
      return { success: false, message: "Temporary credential issuance could not be verified." };
    }

    const auditSecret = process.env.SCOLAPRO_CREDENTIAL_AUDIT_SECRET;
    if (!auditSecret || auditSecret.length < 32) {
      await finalizeFailedAttempt(attemptId);
      return { success: false, message: "Temporary credential issuance is not configured." };
    }

    // Managed passwords are only for an already-linked, provider-recognized
    // email identity. Unverified/unconfirmed accounts stay on the safer
    // activation-link path owned by #1202.
    const { data: targetAuthData, error: targetAuthError } =
      await admin.auth.admin.getUserById(reserved.target_user_id);
    const targetAuthUser = targetAuthData?.user ?? null;
    if (
      targetAuthError ||
      !targetAuthUser ||
      !targetAuthUser.email ||
      !targetAuthUser.email_confirmed_at
    ) {
      await finalizeFailedAttempt(attemptId);
      return { success: false, message: "The staff account is not eligible for managed credentials." };
    }

    const { data: securityProfile, error: profileReadError } = await admin
      .from("user_profiles")
      .select("user_id,must_change_password,password_rotation_expires_at")
      .eq("user_id", reserved.target_user_id)
      .maybeSingle();
    const previousProfile = securityProfile as SecurityProfileRow | null;
    if (profileReadError || !previousProfile || previousProfile.user_id !== reserved.target_user_id) {
      await finalizeFailedAttempt(attemptId);
      return { success: false, message: "The staff account security profile could not be verified." };
    }

    const password = generateStaffTemporaryPassword();
    const expiresAt = new Date(Date.now() + TEMPORARY_CREDENTIAL_TTL_MS).toISOString();
    const fingerprint = fingerprintStaffTemporaryPassword(password, auditSecret);

    // Arm the route gate before changing the provider password. If the Auth
    // mutation fails, restore the prior profile state using the same trusted
    // service boundary. If restoration fails, the account remains fail-closed.
    const { data: armedProfile, error: armError } = await admin
      .from("user_profiles")
      .update({
        must_change_password: true,
        password_rotation_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", reserved.target_user_id)
      .select("user_id")
      .maybeSingle();
    if (armError || armedProfile?.user_id !== reserved.target_user_id) {
      await finalizeFailedAttempt(attemptId);
      return { success: false, message: "The staff account security gate could not be prepared." };
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      reserved.target_user_id,
      { password },
    );
    if (authError) {
      await admin
        .from("user_profiles")
        .update({
          must_change_password: previousProfile.must_change_password,
          password_rotation_expires_at: previousProfile.password_rotation_expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", reserved.target_user_id);
      await finalizeFailedAttempt(attemptId);
      return { success: false, message: "The temporary credential could not be issued." };
    }
    authPasswordChanged = true;

    const { data: finalized, error: finalizeError } = await admin.rpc(
      "finalize_staff_credential_issuance",
      {
        p_attempt_id: attemptId,
        p_outcome: "completed",
        p_credential_fingerprint: fingerprint,
        p_credential_expires_at: expiresAt,
      },
    );
    if (finalizeError || finalized !== true) {
      // Never return an unaudited credential. The account remains rotation-
      // gated and a later governed reissue can replace this unknown password.
      return { success: false, message: "Credential issuance could not be finalized. Reissue the credential before handoff." };
    }

    // This is the only plaintext return. Callers must display it once and must
    // never persist, log, email, text, or include it in analytics.
    return { success: true, password, expiresAt };
  } catch {
    if (attemptId && !authPasswordChanged) await finalizeFailedAttempt(attemptId);
    return { success: false, message: "Temporary credential issuance failed safely." };
  }
}
