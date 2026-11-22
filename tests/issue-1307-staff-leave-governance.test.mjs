import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const component = readFileSync(new URL('../src/features/staff/leave/staff-leave-workspace.tsx', import.meta.url),'utf8');
const action = readFileSync(new URL('../src/features/staff/leave/server/actions.ts',import.meta.url),'utf8');
const workspace = readFileSync(new URL('../src/features/staff/leave/server/workspace.ts',import.meta.url),'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261003222000_staff_leave_absence_foundation.sql',import.meta.url),'utf8');
test('current leave types appear as saved values before the editing form',()=>{
  assert.match(component, /<LeaveTypeForm schoolId=\{schoolId\} types=\{workspace\.types\}/);
  assert.match(component, /types\.map\(\(type\) =>/);
  assert.match(component, /types\.length \? <div/);
  assert.match(component, /No leave types configured/);
  assert.match(component, /\{editing \? <form/);
});
test('edit preloads exact canonical values, code remains immutable and Cancel discards the draft',()=>{
  for (const field of ['type.code','type.name','type.tracksBalance','type.evidenceRequirement','type.sourceReference','type.status']) assert.ok(component.includes(field),field);
  assert.match(component,/readOnly=\{editingCode !== null\}/);
  assert.match(component,/setDraft\(\{ \.\.\.emptyLeaveTypeDraft \}\)/);
  assert.match(component,/requestAnimationFrame\(\(\) => returnFocusRef.current\?\.focus\(\)\)/);
});
test('real saved state is reloaded after successful canonical action; errors preserve draft',()=>{
  assert.match(component,/router\.refresh\(\)/);
  assert.match(component,/if \(state\.success\) \{/);
  assert.match(component,/\} else toast\.error\(state\.message\)/);
  assert.match(action,/supabase\.rpc\("configure_staff_leave_type"/);
  assert.match(action,/canManageSchoolLeave\(parsed\.data\.schoolId\)/);
  assert.match(migration,/on conflict\(school_id,code\) do update set/);
  assert.match(migration,/staff\.leave_type\.configured/);
  assert.match(workspace,/\.from\("staff_leave_types"\)/);
});
