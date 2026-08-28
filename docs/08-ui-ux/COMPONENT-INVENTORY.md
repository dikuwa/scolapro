# ScolaPro Component Inventory

> ScolaPro uses a shared component system. Feature pages must compose these primitives and patterns before inventing new UI.

## 1. Component Strategy

Use **shadcn/ui as owned source code** and adapt it to ScolaPro tokens, density, accessibility and motion standards.

Do not import unrelated visual component libraries into feature pages. Third-party functional libraries may be used behind a ScolaPro wrapper when necessary.

## 2. Foundation Components

Required early:
- Button
- IconButton
- LinkButton
- Input
- SearchInput
- Textarea
- Label
- Field / FormField
- FieldError
- Checkbox
- RadioGroup
- Switch
- Slider
- Select
- Combobox / Typeahead
- MultiSelect
- DatePicker
- DateRangePicker
- TimePicker
- Calendar
- Badge / StatusBadge
- Avatar
- Separator
- Tooltip
- Popover
- DropdownMenu
- ContextMenu where justified
- Tabs
- Accordion
- Collapsible
- Dialog
- AlertDialog
- Sheet / Drawer
- CommandPalette
- Skeleton
- Spinner
- Progress
- EmptyState
- Alert / Banner
- Pagination
- Breadcrumb only where useful

## 3. ScolaPro Composite Components

Build reusable domain-neutral patterns:

### App structure
- `AppShell`
- `SidebarNav`
- `TopBar`
- `TenantSchoolSwitcher`
- `GlobalSearch`
- `PageHeader`
- `SectionHeader`
- `ActionBar`
- `MobileActionBar`
- `ContextTabs`

### Data
- `DataTable`
- `DataGridToolbar`
- `FilterBar`
- `FilterSheet`
- `ColumnVisibilityMenu`
- `BulkActionBar`
- `TableEmptyState`
- `TableSkeleton`
- `StatValue`
- `MetricStrip`
- `TrendIndicator`
- `ReadinessMeter`

### Forms
- `FormSection`
- `FormGrid`
- `StickyFormActions`
- `SearchableEntityPicker`
- `LearnerPicker`
- `StaffPicker`
- `SubjectPicker`
- `ClassPicker`
- `ReasonPicker`
- `DocumentUploader`
- `ImageUploader`

### Feedback
- `AsyncButton`
- `SaveState`
- `SyncState`
- `OfflineBanner`
- `InlineStatus`
- `ErrorState`
- `PermissionState`
- `ConfirmActionDialog`
- `ProgressDialog`

### Navigation / discovery
- `ReportSearch`
- `QuickActions`
- `TaskList`
- `NotificationList`

## 4. Education Workflow Components

Build only after generic primitives are stable:

### Learners
- `LearnerIdentityCell`
- `LearnerSummaryHeader`
- `LearnerProfileNav`
- `GuardianSummary`
- `LearnerTimeline`
- `TransferHistory`

### Attendance
- `DailyAttendanceGrid`
- `WeeklyAttendanceGrid`
- `AttendanceStatusPicker`
- `AttendanceReasonPicker`
- `AttendanceSummary`
- `AttendanceConfirmBar`

### Marks
- `MarksGrid`
- `MarkCell`
- `MarkStatusPicker`
- `MarksCompleteness`
- `MarkWindowStatus`
- `ModerationStatus`
- `CalculationBreakdown`

### Teaching
- `LessonPlanEditor`
- `CoverageStatus`
- `PacingTimeline`
- `CurriculumCompetencyPicker`
- `TeachingWeekHeader`

### LTSM
- `InventoryTable`
- `BookCopyStatus`
- `BarcodeScanner`
- `IssueReturnPanel`
- `ShortageIndicator`

### Statutory
- `ReadinessChecklist`
- `ValidationIssueList`
- `CertificationPanel`
- `SnapshotStatus`

## 5. Browser-Native UI Ban

Core workflows must not expose raw browser-styled:
- `<select>` UI;
- radio button UI;
- checkbox UI;
- date picker UI;
- file input UI as final presentation;
- `alert()`;
- `confirm()`;
- `prompt()`.

Use styled accessible components instead.

Exceptions require a documented technical/accessibility reason.

## 6. Tooltip Rules

Use the shared `src/components/ui/tooltip.tsx` primitive for tooltips. Do not recreate tooltip behavior with page-specific CSS or the browser `title` attribute.

Tooltips are for meaningful interactive items whose purpose is not already obvious from visible text. In particular:
- collapsed sidebar navigation icons may show a tooltip;
- icon-only actions with unclear meaning may show a tooltip;
- the sidebar collapse/expand chevron must **never** show a tooltip;
- controls that already have a visible label should normally not show a duplicate tooltip.

Interaction and presentation requirements:
- default reveal delay is 500ms and must remain within the 400–600ms range unless accessibility testing justifies otherwise;
- hide immediately when hover/focus leaves;
- keyboard focus receives the same delayed tooltip behavior;
- use `role="tooltip"` and connect the trigger with `aria-describedby` while visible;
- use theme-aware light/elevated ScolaPro surfaces, subtle borders and `--shadow-sm`;
- use `--radius-sm` rather than pill styling;
- tooltip title is compact and stronger than its optional description;
- never use the former dark/inverted pseudo-element tooltip treatment.

## 7. Component States

Every interactive component must account for applicable states:
- default;
- hover;
- focus-visible;
- active/pressed;
- selected;
- disabled;
- loading/pending;
- error;
- success where relevant;
- read-only;
- offline/sync-pending where relevant.

## 8. Styling Rules

Components use:
- semantic design tokens;
- approved type scale;
- approved spacing scale;
- approved radius and shadow scale;
- shared motion tokens.

No feature-specific hardcoded colors or arbitrary pixel values unless justified.

## 9. Accessibility Rules

Components must preserve:
- keyboard navigation;
- focus management;
- semantic labelling;
- screen-reader names;
- usable touch targets;
- contrast;
- reduced-motion behavior.

## 10. Component Review Rule

Before creating a new component:
1. check shadcn primitives;
2. check ScolaPro `components/ui`;
3. check ScolaPro composite components;
4. extend an existing component where conceptually correct;
5. create a new component only if the interaction/pattern is genuinely distinct.

The goal is consistency, not minimizing file count at all costs.
