import { NextResponse } from "next/server";
import { z } from "zod";
import { issueLibraryResource, returnLibraryResource } from "@/features/library/server/actions";
import { getUserContext } from "@/lib/auth/get-user-context";

const ltsmRoles = new Set(["school_admin", "principal", "deputy_principal", "librarian", "ltsm"]);

const schema = z.object({
  scope: z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), schoolId: z.string().uuid() }),
  payload: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("issue"),
      clientMutationId: z.string().uuid(),
      copyId: z.string().uuid(),
      borrowerType: z.enum(["learner", "staff"]),
      borrowerId: z.string().uuid(),
      dueOn: z.string().date().nullable(),
      notes: z.string().max(1000).nullable(),
    }),
    z.object({
      action: z.literal("return"),
      clientMutationId: z.string().uuid(),
      loanId: z.string().uuid(),
      returnedCondition: z.string().min(1).max(32),
      notes: z.string().max(1000).nullable(),
    }),
  ]),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Offline circulation payload is invalid." }, { status: 400 });

  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (
    !context.user
    || context.user.id !== parsed.data.scope.userId
    || !membership
    || membership.tenantId !== parsed.data.scope.tenantId
    || membership.schoolId !== parsed.data.scope.schoolId
    || !ltsmRoles.has(membership.roleKey)
  ) {
    return NextResponse.json({ message: "Your current library access changed before this offline action could sync." }, { status: 409 });
  }

  const formData = new FormData();
  const payload = parsed.data.payload;
  if (payload.action === "issue") {
    formData.set("copyId", payload.copyId);
    formData.set("borrowerType", payload.borrowerType);
    formData.set("borrowerId", payload.borrowerId);
    formData.set("dueOn", payload.dueOn ?? "");
    formData.set("notes", payload.notes ?? "");
    const result = await issueLibraryResource({}, formData);
    return NextResponse.json(result, { status: result.success ? 200 : 409 });
  }

  formData.set("loanId", payload.loanId);
  formData.set("returnedCondition", payload.returnedCondition);
  formData.set("notes", payload.notes ?? "");
  const result = await returnLibraryResource({}, formData);
  return NextResponse.json(result, { status: result.success ? 200 : 409 });
}
