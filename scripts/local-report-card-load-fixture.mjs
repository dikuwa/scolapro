import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireLoopbackUrl } from "./lib/localhost-only.mjs";

const ACTION = process.argv[2] ?? "prepare";
const SCHOOL_COUNT = 3;
const LEARNERS_PER_SCHOOL = 12;
const BENCHMARK_EMAILS = Array.from(
  { length: SCHOOL_COUNT },
  (_, index) => `scolapro-report-card-load-local-${index + 1}@example.test`,
);
const BENCHMARK_PASSWORD = "ScolaPro-Local-Load-Only-2026!";
const SCHOOL_PREFIX = "ScolaPro Local Load School";
const TEMPLATE_KEY = "TERM_REPORT";
const TEMPLATE_VERSION = "SCOLAPRO_TERM_REPORT_V1";
const ACADEMIC_YEAR = 2026;
const TERM_NUMBER = 3;
let cachedLocalStatus;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function localStatus() {
  if (cachedLocalStatus) return cachedLocalStatus;

  const supabaseHome = process.env.SUPABASE_HOME ?? path.join(tmpdir(), "scolapro-supabase-cli");
  mkdirSync(supabaseHome, { recursive: true });
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_HOME: supabaseHome,
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
    }),
  );
  try {
    requireLoopbackUrl(status.API_URL, {
      label: "Local fixture Supabase API URL",
      protocols: ["http:", "https:"],
    });
    requireLoopbackUrl(status.DB_URL, {
      label: "Local fixture Supabase DB URL",
      protocols: ["postgres:", "postgresql:"],
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (!status.SERVICE_ROLE_KEY || !status.PUBLISHABLE_KEY) {
    fail("Local Supabase did not report required keys.");
  }
  cachedLocalStatus = status;
  return cachedLocalStatus;
}

function stableUuid(seed) {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const schoolIds = Array.from({ length: SCHOOL_COUNT }, (_, index) =>
  stableUuid(`scolapro-local-report-card-school-${index + 1}`),
);

function learnerId(schoolIndex, learnerIndex) {
  return stableUuid(`scolapro-local-report-card-learner-${schoolIndex + 1}-${learnerIndex + 1}`);
}

function enrolmentId(schoolIndex, learnerIndex) {
  return stableUuid(`scolapro-local-report-card-enrolment-${schoolIndex + 1}-${learnerIndex + 1}`);
}

function snapshotId(schoolIndex, learnerIndex) {
  return stableUuid(`scolapro-local-report-card-snapshot-${schoolIndex + 1}-${learnerIndex + 1}`);
}

function allLearnerIds() {
  const ids = [];
  for (let schoolIndex = 0; schoolIndex < SCHOOL_COUNT; schoolIndex += 1) {
    for (let learnerIndex = 0; learnerIndex < LEARNERS_PER_SCHOOL; learnerIndex += 1) {
      ids.push(learnerId(schoolIndex, learnerIndex));
    }
  }
  return ids;
}

function sqlUuidList(values) {
  return values.map((value) => `'${value}'::uuid`).join(",");
}

function sqlTextList(values) {
  return values.map((value) => `'${String(value).replaceAll("'", "''")}'`).join(",");
}

function runLocalSql(sql) {
  localStatus();
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_scolapro",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function clients() {
  const status = localStatus();
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    status,
    admin: createClient(status.API_URL, status.SERVICE_ROLE_KEY, options),
  };
}

async function cleanup() {
  const { admin } = clients();
  const schoolList = sqlUuidList(schoolIds);
  const learnerList = sqlUuidList(allLearnerIds());
  const emailList = sqlTextList(BENCHMARK_EMAILS);
  const { data: documents, error: documentError } = await admin
    .from("report_card_documents")
    .select("storage_bucket,storage_path")
    .in("school_id", schoolIds);
  if (documentError) throw documentError;
  const artifactPaths = (documents ?? [])
    .filter((document) => document.storage_bucket === "report-card-artifacts")
    .map((document) => document.storage_path);
  if (artifactPaths.length) {
    const { error: storageError } = await admin.storage
      .from("report-card-artifacts")
      .remove(artifactPaths);
    if (storageError) throw storageError;
  }

  runLocalSql([
    "begin",
    // Certified snapshots are intentionally immutable through product paths.
    // This local-only transaction bypasses their guard solely to remove the
    // deterministic benchmark-owned IDs after the run.
    "set local session_replication_role=replica",
    `delete from public.report_card_render_jobs where school_id in (${schoolList})`,
    `delete from public.report_card_documents where school_id in (${schoolList})`,
    `delete from public.report_card_batch_items where batch_id in (select id from public.report_card_batches where school_id in (${schoolList}))`,
    `delete from public.report_card_batches where school_id in (${schoolList})`,
    `delete from public.report_card_snapshots where school_id in (${schoolList})`,
    `delete from public.audit_events where school_id in (${schoolList})`,
    `delete from public.enrolments where school_id in (${schoolList})`,
    `delete from public.school_memberships where school_id in (${schoolList})`,
    `delete from public.learners where id in (${learnerList})`,
    `delete from public.schools where id in (${schoolList})`,
    `delete from auth.identities where identity_data->>'email' in (${emailList})`,
    `delete from auth.users where email in (${emailList})`,
    `do $$ begin
      if exists(select 1 from public.schools where id in (${schoolList}))
        or exists(select 1 from public.report_card_render_jobs where school_id in (${schoolList}))
        or exists(select 1 from public.report_card_documents where school_id in (${schoolList}))
        or exists(select 1 from auth.users where email in (${emailList})) then
        raise exception 'Benchmark-owned cleanup did not complete';
      end if;
    end $$`,
    "commit",
  ].join("; ") + ";");
}

async function requireExclusiveLocalRenderQueue(admin) {
  const { data: activeJobs, error } = await admin
    .from("report_card_render_jobs")
    .select("id,school_id,status")
    .in("status", ["pending", "processing", "retry"])
    .limit(1000);
  if (error) throw error;

  const ownedSchoolIds = new Set(schoolIds);
  const foreignActiveJobs = (activeJobs ?? []).filter((job) => !ownedSchoolIds.has(job.school_id));
  if (foreignActiveJobs.length) {
    fail(
      `Refusing to mix the benchmark with ${foreignActiveJobs.length} active non-fixture report-card job(s). `
      + "Drain or reset the local queue, then retry.",
    );
  }
}

function legacySnapshotData(schoolIndex, learnerIndex) {
  const score = 55 + ((schoolIndex * LEARNERS_PER_SCHOOL + learnerIndex) % 40);
  return {
    school_identity: {
      school_name: `${SCHOOL_PREFIX} ${schoolIndex + 1}`,
      emis_number: `LOCAL-LOAD-${schoolIndex + 1}`,
    },
    school_document_profile: {
      school_name: `${SCHOOL_PREFIX} ${schoolIndex + 1}`,
      emis_number: `LOCAL-LOAD-${schoolIndex + 1}`,
      physical_address: "Loopback Benchmark Campus",
      postal_address: "Local benchmark only",
      town: "Loopback",
      telephone: "",
      fax: "",
      email: BENCHMARK_EMAILS[schoolIndex],
      logo_url: "",
      logo_storage_path: "",
      school_name_font: "default",
    },
    learner: {
      first_names: `Load ${schoolIndex + 1}-${learnerIndex + 1}`,
      surname: "Benchmark",
    },
    enrolment: {
      admission_number: `LOAD-${schoolIndex + 1}-${String(learnerIndex + 1).padStart(3, "0")}`,
      grade: "Benchmark Grade",
      register_class: `LOAD-${schoolIndex + 1}`,
      academic_year: ACADEMIC_YEAR,
    },
    term: { number: TERM_NUMBER, name: `Term ${TERM_NUMBER}` },
    results: [
      {
        subject_offering_id: stableUuid(`scolapro-load-offering-${schoolIndex + 1}`),
        subject_id: stableUuid(`scolapro-load-subject-${schoolIndex + 1}`),
        subject_name: "Benchmark Science",
        subject_code: "LOAD-SCI",
        result_status: "numeric",
        result_value: score,
        percentage_value: score,
        symbol: score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "D",
        minimum_pass_mark: 40,
        promotional: true,
        show_on_report_card: true,
      },
    ],
    attendance: { absent: learnerIndex % 3 },
    remarks: "Local benchmark fixture.",
    report_card_settings: {
      show_percentages: true,
      show_non_promotional_subjects: true,
      show_pass_mark_legend: true,
    },
  };
}

async function prepare() {
  const { admin, status } = clients();
  await cleanup();
  await requireExclusiveLocalRenderQueue(admin);

  const { data: tenants, error: tenantError } = await admin.from("tenants").select("id").limit(1);
  if (tenantError) throw tenantError;
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) fail("Local database has no tenant to host the benchmark fixture.");

  const userIds = [];
  for (const email of BENCHMARK_EMAILS) {
    const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
      email,
      password: BENCHMARK_PASSWORD,
      email_confirm: true,
    });
    if (userError || !createdUser.user) throw userError ?? new Error("Benchmark user was not created.");
    userIds.push(createdUser.user.id);
  }

  const schools = schoolIds.map((id, index) => ({
    id,
    tenant_id: tenantId,
    name: `${SCHOOL_PREFIX} ${index + 1}`,
    emis_number: `LOCAL-LOAD-${index + 1}`,
    region: "Local Benchmark",
    town: "Loopback",
    status: "active",
  }));
  const { error: schoolError } = await admin.from("schools").insert(schools);
  if (schoolError) throw schoolError;

  const memberships = schoolIds.map((schoolId, index) => ({
    tenant_id: tenantId,
    school_id: schoolId,
    user_id: userIds[index],
    role_key: "school_admin",
    active_from: "2026-01-01",
  }));
  const { error: membershipError } = await admin.from("school_memberships").insert(memberships);
  if (membershipError) throw membershipError;

  const learners = [];
  const enrolments = [];
  const snapshots = [];
  for (let learnerIndex = 0; learnerIndex < LEARNERS_PER_SCHOOL; learnerIndex += 1) {
    for (let schoolIndex = 0; schoolIndex < SCHOOL_COUNT; schoolIndex += 1) {
      const lid = learnerId(schoolIndex, learnerIndex);
      const eid = enrolmentId(schoolIndex, learnerIndex);
      learners.push({
        id: lid,
        tenant_id: tenantId,
        first_names: `Load ${schoolIndex + 1}-${learnerIndex + 1}`,
        surname: "Benchmark",
        sex: learnerIndex % 2 ? "female" : "male",
      });
      enrolments.push({
        id: eid,
        tenant_id: tenantId,
        school_id: schoolIds[schoolIndex],
        learner_id: lid,
        academic_year: ACADEMIC_YEAR,
        admission_number: `LOAD-${schoolIndex + 1}-${String(learnerIndex + 1).padStart(3, "0")}`,
        enrolled_from: "2026-01-01",
        status: "current",
      });
      snapshots.push({
        id: snapshotId(schoolIndex, learnerIndex),
        tenant_id: tenantId,
        school_id: schoolIds[schoolIndex],
        learner_id: lid,
        enrolment_id: eid,
        academic_year: ACADEMIC_YEAR,
        term_number: TERM_NUMBER,
        template_version: TEMPLATE_VERSION,
        snapshot_version: 1,
        data_snapshot: legacySnapshotData(schoolIndex, learnerIndex),
        status: "certified",
        generated_by_user_id: userIds[schoolIndex],
        generated_at: "2026-09-30T08:00:00.000Z",
        certified_by_user_id: userIds[schoolIndex],
        certified_at: "2026-09-30T08:05:00.000Z",
      });
    }
  }

  for (const [table, rows] of [
    ["learners", learners],
    ["enrolments", enrolments],
    ["report_card_snapshots", snapshots],
  ]) {
    const { error } = await admin.from(table).insert(rows);
    if (error) throw error;
  }

  const schoolClients = [];
  for (const email of BENCHMARK_EMAILS) {
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: BENCHMARK_PASSWORD,
    });
    if (signInError) throw signInError;
    schoolClients.push(client);
  }

  let queued = 0;
  for (let learnerIndex = 0; learnerIndex < LEARNERS_PER_SCHOOL; learnerIndex += 1) {
    for (let schoolIndex = 0; schoolIndex < SCHOOL_COUNT; schoolIndex += 1) {
      const sid = snapshotId(schoolIndex, learnerIndex);
      for (const format of ["html", "pdf"]) {
        const { error } = await schoolClients[schoolIndex].rpc("queue_report_card_render", {
          p_snapshot_id: sid,
          p_template_key: TEMPLATE_KEY,
          p_template_version: TEMPLATE_VERSION,
          p_document_format: format,
        });
        if (error) throw error;
        queued += 1;
      }
    }
  }

  console.log(JSON.stringify({
    mode: "local-only",
    schools: SCHOOL_COUNT,
    learnersPerSchool: LEARNERS_PER_SCHOOL,
    snapshots: snapshots.length,
    queuedJobs: queued,
    schoolIds,
  }, null, 2));
}

async function verify() {
  const { admin } = clients();
  const { data: jobs, error } = await admin
    .from("report_card_render_jobs")
    .select("id,school_id,snapshot_id,template_key,template_version,renderer_version,status,attempt_count,document_format,output_document_id,completed_at,locked_at")
    .in("school_id", schoolIds)
    .order("created_at");
  if (error) throw error;

  const expected = SCHOOL_COUNT * LEARNERS_PER_SCHOOL * 2;
  const rows = jobs ?? [];
  const jobIdentity = (row) => [
    row.snapshot_id,
    row.template_key,
    row.template_version,
    row.renderer_version,
    row.document_format,
  ].join(":");
  const duplicateJobIdentities = rows.length - new Set(rows.map(jobIdentity)).size;
  const outputIds = rows.map((row) => row.output_document_id).filter(Boolean);
  const duplicateOutputDocumentIds = outputIds.length - new Set(outputIds).size;

  const { data: documents, error: documentError } = await admin
    .from("report_card_documents")
    .select("id,school_id,status,storage_bucket,storage_path")
    .in("school_id", schoolIds);
  if (documentError) throw documentError;
  const documentRows = documents ?? [];
  const documentIds = new Set(documentRows.map((document) => document.id));
  const perSchool = schoolIds.map((schoolId) => {
    const schoolRows = rows.filter((row) => row.school_id === schoolId);
    return {
      schoolId,
      jobs: schoolRows.length,
      completed: schoolRows.filter((row) => row.status === "completed").length,
      htmlCompleted: schoolRows.filter((row) => row.status === "completed" && row.document_format === "html").length,
      pdfCompleted: schoolRows.filter((row) => row.status === "completed" && row.document_format === "pdf").length,
      failed: schoolRows.filter((row) => ["dead", "retry"].includes(row.status)).length,
      maxAttemptCount: Math.max(0, ...schoolRows.map((row) => Number(row.attempt_count ?? 0))),
    };
  });
  const active = rows.filter((row) => ["pending", "processing", "retry"].includes(row.status)).length;
  const completed = rows.filter((row) => row.status === "completed").length;
  const dead = rows.filter((row) => row.status === "dead").length;
  const exactlyOnce = rows.every((row) => Number(row.attempt_count) === 1);
  const completionStateValid = rows.every((row) =>
    row.status === "completed" && row.completed_at && !row.locked_at && row.output_document_id,
  );
  const outputsMatch = outputIds.length === expected
    && outputIds.every((outputId) => documentIds.has(outputId))
    && documentRows.length === expected
    && documentRows.every((document) =>
      document.status === "ready"
      && document.storage_bucket === "report-card-artifacts"
      && document.storage_path.startsWith(`${document.school_id}/`),
    );

  const summary = {
    expectedJobs: expected,
    observedJobs: rows.length,
    completed,
    active,
    dead,
    duplicateJobIdentities,
    duplicateOutputDocumentIds,
    exactlyOnce,
    completionStateValid,
    outputsMatch,
    perSchool,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (
    rows.length !== expected ||
    completed !== expected ||
    active !== 0 ||
    dead !== 0 ||
    duplicateJobIdentities !== 0 ||
    duplicateOutputDocumentIds !== 0 ||
    !exactlyOnce ||
    !completionStateValid ||
    !outputsMatch ||
    perSchool.some((school) =>
      school.completed !== LEARNERS_PER_SCHOOL * 2
      || school.htmlCompleted !== LEARNERS_PER_SCHOOL
      || school.pdfCompleted !== LEARNERS_PER_SCHOOL,
    )
  ) {
    process.exit(1);
  }
}

async function main() {
  if (process.env.REPORT_CARD_LOAD_TEST_ARMED !== "YES") {
    fail(`Refusing to ${ACTION} local load fixture: set REPORT_CARD_LOAD_TEST_ARMED=YES.`);
  }
  localStatus();
  if (ACTION === "cleanup") {
    await cleanup();
    console.log(JSON.stringify({ cleaned: true, schoolIds }, null, 2));
    return;
  }
  if (ACTION === "prepare") return prepare();
  if (ACTION === "verify") return verify();
  fail(`Unknown action "${ACTION}". Use prepare, verify, or cleanup.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
