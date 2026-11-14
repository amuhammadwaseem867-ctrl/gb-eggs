-- =============================================================================
-- GB Eggs ERP — 0012 Pin search_path on trigger helper functions
-- (Supabase security advisor: function_search_path_mutable)
-- =============================================================================
alter function public.set_updated_at() set search_path = public;
alter function public.forbid_mutation() set search_path = public;
alter function public.forbid_mutation_unless_internal() set search_path = public;
alter function public._check_shed_farm() set search_path = public;
alter function public._protect_egg_unit() set search_path = public;
alter function public._feed_inventory_init() set search_path = public;
alter function public._payments_lock() set search_path = public;
alter function public._internal(boolean) set search_path = public;
alter function public._egg_collection_lock() set search_path = public;
alter function public._attendance_guard() set search_path = public;
alter function public._guard_internal_columns() set search_path = public;
