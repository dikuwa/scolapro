import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const src = readFileSync(new URL('../src/features/library/booklist-metrics.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compiledModule = { exports: {} };
new Function('module', 'exports', js)(compiledModule, compiledModule.exports);
const { deriveGradeBooklistDemand } = compiledModule.exports;
const item = [{ id: 'req', gradeId: 'g1', titleId: 't1', copiesPerLearner: 2, status: 'active' }];
const c = (id, availability = 'available', condition = 'good') => ({ id, titleId: 't1', availability, condition });
const loan = (copyId, borrowerId, status = 'open') => ({ copyId, borrowerId, borrowerType: 'learner', status });

test('missing booklist has no fabricated demand', () => {
  assert.deepEqual(deriveGradeBooklistDemand([], ['a'], [], []), []);
});
test('grade requirements reflect actual active enrolment and stock', () => {
  const [m] = deriveGradeBooklistDemand(item, ['a','b','b'], [c('a'), c('b')], []);
  assert.deepEqual([m.learners,m.required,m.available,m.potentialShortage],[2,4,2,2]);
});
test('active grade loans reduce unmet requirement without counting loaned stock as available', () => {
  const [m] = deriveGradeBooklistDemand(item,['a','b'],[c('a','on_loan'), c('b')],[loan('a','a')]);
  assert.deepEqual([m.required,m.allocated,m.available,m.unallocated,m.potentialShortage],[4,1,1,3,2]);
});
test('other grades, staff loans, returned loans, lost copies and inactive requirements do not inflate coverage', () => {
  const [m] = deriveGradeBooklistDemand(item,['a'],[c('a','on_loan'),c('b','lost','lost'),c('c','on_loan')],[loan('a','z'), loan('c','a','returned'), { ...loan('a','a'), borrowerType: 'staff' }]);
  assert.deepEqual([m.required,m.allocated,m.available,m.potentialShortage],[2,0,0,2]);
  assert.deepEqual(deriveGradeBooklistDemand([{...item[0],status:'inactive'}],['a'],[],[]),[]);
});
test('available-but-damaged catalog copies do not reduce textbook shortages', () => {
  // Bulk catalog imports can contain availability=available alongside damaged
  // condition. The physical copy is not a usable fulfilment source.
  const [m] = deriveGradeBooklistDemand(item,['a'],
    [c('damaged','available','damaged'),c('good'),c('lost','available','lost')],[]);
  assert.deepEqual([m.required,m.allocated,m.available,m.potentialShortage],[2,0,1,1]);
});
test('surplus copies held by one learner cannot mask another learner shortage', () => {
  const oneCopy = [{ ...item[0], copiesPerLearner: 1 }];
  const [m] = deriveGradeBooklistDemand(
    oneCopy,
    ['a','b'],
    [c('c1','on_loan'), c('c2','on_loan'), c('c3','on_loan')],
    [loan('c1','a'), loan('c2','a'), loan('c3','a')],
  );
  assert.deepEqual([m.required,m.allocated,m.unallocated,m.potentialShortage],[2,1,1,1]);
});
test('each learner contributes at most the requirement to allocated copies', () => {
  const [m] = deriveGradeBooklistDemand(
    item,
    ['a','b'],
    [c('c1','on_loan'), c('c2','on_loan'), c('c3','on_loan'), c('c4','on_loan'), c('c5','on_loan')],
    [loan('c1','a'), loan('c2','a'), loan('c3','a'), loan('c4','b'), loan('c5','b')],
  );
  // copiesPerLearner is 2: learner a contributes 2 of 3 held, learner b 2 of 2.
  assert.deepEqual([m.required,m.allocated,m.unallocated,m.potentialShortage],[4,4,0,0]);
});
