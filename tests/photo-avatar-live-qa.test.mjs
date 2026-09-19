import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const avatarApi = source("src/app/api/profile/avatar/route.ts");
const avatarActions = source("src/features/profile/server/actions.ts");
const avatarUpload = source("src/features/profile/server/avatar-upload.ts");
const profileSettings = source("src/features/profile/profile-settings.tsx");
const shell = source("src/components/shell/app-shell.tsx");
const learnerActions = source("src/features/learners/server/actions.ts");
const learnerUpload = source("src/features/learners/server/photo-upload.ts");
const learnerQueries = source("src/features/learners/server/queries.ts");
const learnerPage = source("src/app/learners/[id]/page.tsx");
const currentScope = source("supabase/migrations/20260912203500_learner_photo_current_artifact_scope.sql");
const learnerReadScope = source("supabase/migrations/20260912200500_learner_identity_assignment_scope_compat.sql");
const avatarFoundation = source("supabase/migrations/20260828000000_user_experience_foundation.sql");

test("profile avatar API is authenticated, owner-scoped and validates image type and size", () => {
  assert.match(avatarApi, /supabase\.auth\.getUser\(\)/);
  assert.match(avatarApi, /user\.id.*avatar-/s);
  assert.match(avatarApi, /allowedAvatarTypes/);
  assert.match(avatarApi, /3 \* 1024 \* 1024/);
  assert.match(avatarApi, /\.eq\("user_id", user\.id\)/);
});

test("signed avatar finalization verifies the uploaded object before linking", () => {
  assert.match(avatarActions, /avatarPathPattern/);
  assert.match(avatarActions, /match\[1\] !== user\.id/);
  assert.match(avatarActions, /createSupabaseAdminClient/);
  assert.match(avatarActions, /from\("avatars"\)\.list\(user\.id/);
  assert.match(avatarActions, /item\.name === fileName/);
  assert.match(avatarActions, /uploaded avatar could not be verified/);
});

test("avatar storage remains existing public profile-photo store with owner-only mutation paths", () => {
  assert.match(avatarFoundation, /avatars.*true.*3145728/s);
  assert.match(avatarFoundation, /storage\.foldername\(name\).*auth\.uid/s);
  assert.match(avatarUpload, /createSignedUploadUrl\(path\)/);
  assert.match(profileSettings, /getPublicUrl\(ticket\.path\)/);
});

test("learner photos remain signed and current-enrolment scoped", () => {
  assert.match(currentScope, /status = 'current'/);
  assert.match(currentScope, /enrolled_from <= current_date/);
  assert.match(currentScope, /enrolled_to is null or e\.enrolled_to >= current_date/);
  assert.match(currentScope, /platform_support/);
  assert.match(currentScope, /staff_member_covers_school_period/);
  assert.match(learnerReadScope, /status='current'/);
  assert.match(learnerReadScope, /platform_support/);
  assert.match(learnerQueries, /createSignedUrl\(learner\.photo_path/);
  assert.doesNotMatch(learnerQueries, /getPublicUrl\(learner\.photo_path/);
});

test("learner-photo tickets preserve MIME, size and path ownership boundaries", () => {
  assert.match(learnerUpload, /image\/jpeg.*image\/png.*image\/webp/s);
  assert.match(learnerUpload, /can_prepare_learner_photo_upload/);
  assert.match(learnerUpload, /parsed\.data\.schoolId.*parsed\.data\.learnerId.*crypto\.randomUUID/s);
  assert.match(learnerActions, /maxPhotoBytes = 5 \* 1024 \* 1024/);
  assert.match(learnerActions, /learnerPhotoPathPattern/);
});

test("private learner-photo storage identifiers stay out of generic logs", () => {
  assert.doesNotMatch(learnerActions, /console\.(?:error|warn)\([^\n]+path:/);
  assert.doesNotMatch(learnerUpload, /console\.(?:error|warn)\([^\n]+path:/);
});

test("missing image objects retain visible fallback behavior", () => {
  assert.match(shell, /initials\(name\)/);
  assert.match(shell, /absolute inset-0 size-full object-cover/);
  assert.match(learnerPage, /avatarInitials/);
  assert.match(learnerPage, /src=\{learner\.photoUrl\}/);
  assert.match(profileSettings, /onError=\{\(\) => setPreviewUrl\(null\)\}/);
});

test("photo and avatar controls retain responsive primitives", () => {
  assert.match(profileSettings, /grid gap-5 lg:grid-cols-2/);
  assert.match(profileSettings, /flex flex-col gap-4 sm:flex-row sm:items-center/);
  assert.match(learnerPage, /flex flex-col gap-4 sm:flex-row/);
  assert.match(learnerPage, /xl:grid-cols-/);
});
