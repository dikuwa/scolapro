#!/usr/bin/env bash
set -euo pipefail

pnpm dlx shadcn@latest add \
  button \
  input \
  textarea \
  checkbox \
  radio-group \
  switch \
  select \
  command \
  popover \
  calendar \
  dialog \
  alert-dialog \
  drawer \
  dropdown-menu \
  tooltip \
  tabs \
  badge \
  avatar \
  separator \
  skeleton \
  progress \
  table \
  pagination

printf '\nScolaPro UI primitives installed. Review generated components against docs/08-ui-ux/DESIGN-SYSTEM.md before feature work.\n'
