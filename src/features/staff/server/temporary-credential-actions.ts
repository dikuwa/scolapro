"use server";

import { z } from "zod";
import { issueStaffTemporaryCredential } from "@/features/staff/server/temporary-credential-issuance";

export type StaffTemporaryCredentialState = {
  success?: boolean;
  message?: string;
  temporaryPassword?: string;
  expiresAt?: string;
};

const issueSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
});

// Browser-callable boundary for the explicit Staff Directory control.
// Authorization, linked-account validation, rate limits, protected-account
// checks, provider mutation and audit finalization remain inside the governed
// issuer. No plaintext credential is accepted as input or persisted here.
export async function issueStaffTemporaryCredentialAction(
  formData: FormData,
): Promise<StaffTemporaryCredentialState> {
  const parsed = issueSchema.safeParse({
    schoolId: formData.get("schoolId"),
    staffMemberId: formData.get("staffMemberId"),
  });
  if (!parsed.success) {
    return { message: "Temporary credential issuance could not be started." };
  }

  const result = await issueStaffTemporaryCredential(
    parsed.data.schoolId,
    parsed.data.staffMemberId,
  );
  if (!result.success) {
    return { message: "Temporary credential could not be issued for this staff account." };
  }

  // The plaintext secret is returned exactly once by this action response.
  // There is no readback endpoint or database copy.
  return {
    success: true,
    message: "Temporary credential issued. Copy it now; it cannot be shown again.",
    temporaryPassword: result.password,
    expiresAt: result.expiresAt,
  };
}
