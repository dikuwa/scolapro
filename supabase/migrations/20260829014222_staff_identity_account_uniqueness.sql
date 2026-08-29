-- One authenticated account maps to at most one staff identity inside a tenant.
-- This prevents invitation acceptance and later account-link workflows from
-- creating parallel staff identities for the same person/account.

create unique index if not exists staff_members_tenant_user_unique_idx
on public.staff_members(tenant_id,user_id)
where user_id is not null;

comment on index public.staff_members_tenant_user_unique_idx is
'Ensures a signed-in user has at most one tenant-wide staff identity per tenant.';
