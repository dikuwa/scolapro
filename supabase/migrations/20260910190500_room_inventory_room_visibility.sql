create policy "inventory custodians read assigned rooms" on public.school_rooms
for select to authenticated
using (app_private.is_current_room_inventory_custodian(id));
