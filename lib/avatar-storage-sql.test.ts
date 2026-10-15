import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
it('keeps avatar writes server-only even when another Storage policy grants broadly', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage; grant usage on schema storage to anon, authenticated, service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id text primary key,bucket_id text,name text); alter table storage.objects enable row level security;
      grant all on storage.objects to anon,authenticated,service_role;
      create policy legacy_open on storage.objects for all to authenticated using(true) with check(true);`)
    await db.exec(readFileSync(new URL('../supabase/migrations/20261014065458_account_avatars.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into storage.objects values ('avatar','profile-avatars','owner/file.png'),('other','work-images','old.png')`)
    await db.transaction(async tx => {
      await tx.exec('set local role authenticated')
      expect((await tx.query('select id from storage.objects')).rows).toEqual([{ id: 'other' }])
      expect((await tx.query("update storage.objects set name='changed' where id='avatar' returning id")).rows).toHaveLength(0)
      expect((await tx.query("delete from storage.objects where id='avatar' returning id")).rows).toHaveLength(0)
    })
    await expect(db.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.exec("insert into storage.objects values('spoof','profile-avatars','other/file.png')") })).rejects.toMatchObject({ code: '42501' })
    await db.transaction(async tx => { await tx.exec('set local role service_role'); await tx.exec("insert into storage.objects values('server','profile-avatars','owner/second.png')") })
    expect((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='profile-avatars'")).rows[0]).toEqual({ public: true, file_size_limit: 2097152, allowed_mime_types: ['image/png'] })
  } finally { await db.close() }
}, 30000)
