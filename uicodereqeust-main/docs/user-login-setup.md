# User Login Setup

Use Supabase Auth for the actual username/password account, then link the user to an app role in `public.user_roles`.

## 1. Create The Auth User

In Supabase Dashboard:

1. Open `Authentication` > `Users`.
2. Click `Add user`.
3. Enter the email and password.
4. Copy the generated user UUID.

## 2. Assign The App Role

Run one of these SQL snippets in Supabase SQL Editor, replacing the UUID and email values.

### Utilization Manager

```sql
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'utilization_manager')
on conflict do nothing;
```

Login path:

`/backoffice/login`

### Claims Officer

```sql
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'claims')
on conflict do nothing;
```

Login path:

`/backoffice/login`

### Admin

```sql
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'admin')
on conflict do nothing;
```

Login path:

`/backoffice/login`

### Hospital

Create or update the hospital row and attach it to the Auth user:

```sql
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'hospital')
on conflict do nothing;

insert into public.hospitals (
  name,
  code,
  email,
  phone,
  state,
  whatsapp_number,
  user_id,
  is_active
)
values (
  'Hospital Name',
  'HOSP001',
  'hospital@example.com',
  '+2348000000000',
  'Oyo',
  '+2348000000000',
  'USER_UUID_HERE',
  true
)
on conflict (code) do update set
  email = excluded.email,
  phone = excluded.phone,
  whatsapp_number = excluded.whatsapp_number,
  user_id = excluded.user_id,
  is_active = true,
  updated_at = now();
```

Login path:

`/login`

## 3. Verify Routing

After sign-in:

- Hospital users go to `/dashboard`.
- Utilization Manager and admin users go to `/backoffice/utilization-manager`.
- Claims users go to `/backoffice/claims`.

If a user sees `Access Denied`, check that `public.user_roles.user_id` matches the Supabase Auth user UUID and that hospital users also have an active `public.hospitals.user_id` link.
