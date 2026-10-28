# GatePool Backend Security Report

Generated: $(date)

## D-Requirements Status (SECURITY.md)

| D-ID | Requirement | Status | Test | Output/Evidence |
|------|-------------|--------|------|-----------------|
| D1 | RLS enabled on all tables | ☐ Not proven | 07_security.sql T4 | |
| D2 | anon has no table/function access | ☐ Not proven | 07_security.sql T6 | |
| D3 | No function trusts user-supplied user_id | ☐ Not proven | Code review | |
| D4 | All security definer functions set search_path | ☐ Not proven | 07_security.sql static check | |
| D5 | No dynamic SQL in functions | ☐ Not proven | 07_security.sql static check | |
| D6 | No email/phone leakage in RPC | ☐ Not proven | 05_email_phone_routes.sql Test 17, D13 | |
| D7 | Maintenance function not executable by authenticated | ☐ Not proven | 07_security.sql T5 | |
| D8 | Service-role key never committed | ☐ Not proven | Manual check | |
| D9 | Rate limits proven by tests | ☐ Not proven | 07_security.sql T11 | |
| D10 | Audit log for strike/block/late-cancel/rate-limited/config-change | ☐ Not proven | 07_security.sql audit check | |
| D11 | Normal user cannot read/update/delete audit rows | ☐ Not proven | 07_security.sql audit check | |
| D12 | maintenance_mode kill switch works | ☐ Not proven | 07_security.sql maintenance_mode | |
| D13 | No RPC output contains email | ☐ Not proven | 05_email_phone_routes.sql D13 | |
| D14 | Stats counts below stats_min_count are null | ☐ Not proven | 05_email_phone_routes.sql Test 21 | |
| D15 | Retention purge works | ☐ Not proven | Manual/Simulation | |
| D16 | 2FA on all environments | ☐ Not proven | Manual check | |
| D17 | Secret scanning in CI | ☐ Not proven | Manual check | |
| D18 | Three environments (local, staging, production) | ☐ Not proven | Manual check | |

## Test Results Summary

Run `supabase test db` and paste output here:

```
<PASTE TEST OUTPUT HERE>
```

## Load Test Results

Run k6 test and paste summary here:

```
<PASTE K6 OUTPUT HERE>
```

## Invariant Check Results

Run `psql -f supabase/loadtest/invariants.sql` after load test:

```
<PASTE INVARIANT OUTPUT HERE>
```

## Privilege Audit

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and grantee in ('anon','authenticated')
order by routine_name, grantee;
```

Output:
```
<PASTE PRIVILEGE OUTPUT HERE>
```

## Table Privileges

```sql
select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
order by table_name, grantee;
```

Output:
```
<PASTE TABLE PRIVILEGES OUTPUT HERE>
```

## Notes

- Update this report after each test run
- All D-requirements must be "Proven" before launch
- Any "Not proven" items block the security gate