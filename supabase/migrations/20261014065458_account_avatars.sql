-- Profile images are public display identity, separate from private student data.
-- Only verified server actions can write; never allow direct browser mutations,
-- including through a pre-existing permissive Storage policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',true,2097152,array['image/png']) on conflict (id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='profile-avatars' and public
    and file_size_limit=2097152 and allowed_mime_types=array['image/png']) then
    raise exception 'Existing profile-avatars bucket configuration differs';
  end if;
end $$;
create policy profile_avatars_server_only on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'profile-avatars') with check (bucket_id <> 'profile-avatars');
