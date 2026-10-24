import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Ban, RotateCcw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, Select, TextArea } from '../../components/ui/Field'
import { Badge, EmptyState, ErrorState, Spinner } from '../../components/ui/display'
import { Pagination, SearchInput } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDebouncedValue, useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { listAdminUsers, reactivateUser, suspendUser } from '../../services/admin'
import type { AdminUser } from '../../types/api'
import { formatDate, relativeTime } from '../../utils/format'
import { useAuth } from '../auth/AuthContext'

export default function AdminUsersPage() {
  useDocumentTitle('Users')
  const toast = useToast()
  const { user: me } = useAuth()
  const [filters, update] = useUrlState({ q: '', status: '', role: '', page: 1 })
  const [query, setQuery] = useState(filters.q)
  const debounced = useDebouncedValue(query, 350)
  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  const { data, loading, error, reload } = useApi(
    (signal) => listAdminUsers({ q: filters.q, status: filters.status, role: filters.role, page: filters.page }, signal),
    [filters.q, filters.status, filters.role, filters.page],
  )
  const [target, setTarget] = useState<{ user: AdminUser; suspend: boolean } | null>(null)
  const [reason, setReason] = useState('')

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Users</h1>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" label="Search users" value={query} onChange={setQuery} placeholder="Email, name or handle" />
        <Select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status"
          options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
        <Select aria-label="Role" value={filters.role} onChange={(e) => update({ role: e.target.value })} placeholder="Any role"
          options={[{ value: 'user', label: 'Members' }, { value: 'admin', label: 'Admins' }]} />
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <Spinner label="Loading users" /> :
        data && data.items.length === 0 ? <EmptyState title="No users match" /> : data ? (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Users</caption>
                <thead className="border-b border-line text-xs text-subtle uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">User</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Joined</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Last login</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Activity</th>
                    <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-fg">{user.handle ? <Link to={`/people/${user.handle}`} className="hover:text-brand-200">{user.name}</Link> : user.name ?? '—'}</p>
                        <p className="text-xs text-subtle">{user.email}</p>
                        <div className="mt-1 flex gap-1">
                          {user.role === 'admin' && <Badge tone="brand">Admin</Badge>}
                          {user.is_demo && <Badge tone="warning">Demo</Badge>}
                          {!user.email_verified && <Badge tone="outline">Unverified</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</Badge>
                        {user.suspended_reason && <p className="mt-1 max-w-48 text-xs text-subtle">{user.suspended_reason}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDate(user.created_at)}</td>
                      <td className="px-4 py-3 text-muted">{user.last_login_at ? relativeTime(user.last_login_at) : 'Never'}</td>
                      <td className="px-4 py-3 text-xs text-muted">{user.projects_owned} projects<br />{user.open_reports} open reports</td>
                      <td className="px-4 py-3 text-right">
                        {user.id !== me?.id && user.role !== 'admin' && (
                          user.status === 'active' ? (
                            <Button size="sm" variant="danger" icon={<Ban className="size-4" aria-hidden="true" />} onClick={() => { setReason(''); setTarget({ user, suspend: true }) }}>Suspend</Button>
                          ) : (
                            <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={() => setTarget({ user, suspend: false })}>Reactivate</Button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target?.suspend ? `Suspend ${target.user.name ?? target.user.email}?` : `Reactivate ${target?.user.name ?? 'this account'}?`}
        description={target?.suspend ? 'They are signed out immediately and hidden from the directory, matching and messaging until reactivated.' : 'They will be able to sign in again.'}
        tone={target?.suspend ? 'danger' : 'primary'}
        confirmLabel={target?.suspend ? 'Suspend account' : 'Reactivate'}
        confirmDisabled={Boolean(target?.suspend) && reason.trim().length < 3}
        onConfirm={async () => {
          if (!target) return
          if (target.suspend) await suspendUser(target.user.id, reason.trim())
          else await reactivateUser(target.user.id)
          toast.success(target.suspend ? 'Account suspended.' : 'Account reactivated.')
          reload()
        }}
      >
        {target?.suspend && (
          <Field label="Reason (required)" hint="Recorded in the audit log.">
            <TextArea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        )}
      </ConfirmDialog>
    </div>
  )
}
