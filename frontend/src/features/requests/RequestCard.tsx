import { useState } from 'react'
import { Link } from 'react-router'
import { Check, RotateCcw, X } from 'lucide-react'
import { PersonLink } from '../../components/cards'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextArea } from '../../components/ui/Field'
import { Badge, type BadgeTone } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { getErrorMessage } from '../../services/api'
import { acceptRequest, rejectRequest, withdrawRequest } from '../../services/requests'
import type { JoinRequest } from '../../types/api'
import { REQUEST_STATUS_LABELS, ROLE_OPTIONS, labelFor } from '../../utils/constants'
import { relativeTime } from '../../utils/format'
import { useActivity } from '../notifications/ActivityContext'

const STATUS_TONES: Record<JoinRequest['status'], BadgeTone> = {
  pending: 'warning', accepted: 'success', rejected: 'danger', withdrawn: 'neutral',
}

function describe(request: JoinRequest): string {
  if (request.kind === 'application') {
    return request.direction === 'incoming' ? 'wants to join' : 'Your request to join'
  }
  return request.direction === 'incoming' ? 'invited you to join' : 'Your invitation to join'
}

export function RequestCard({ request, onChange, showProject = true }: {
  request: JoinRequest
  onChange: (updated: JoinRequest) => void
  showProject?: boolean
}) {
  const toast = useToast()
  const { refresh } = useActivity()
  const [busy, setBusy] = useState<'accept' | 'withdraw' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const run = async (action: 'accept' | 'withdraw') => {
    setBusy(action)
    try {
      const updated = action === 'accept' ? await acceptRequest(request.id) : await withdrawRequest(request.id)
      onChange(updated)
      refresh()
      toast.success(action === 'accept'
        ? request.kind === 'application' ? `${request.person.name} joined the team.` : 'You joined the team!'
        : 'Withdrawn.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const incoming = request.direction === 'incoming'
  const headline = describe(request)

  return (
    <article className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={request.kind === 'invitation' ? 'info' : 'brand'}>{request.kind === 'invitation' ? 'Invitation' : 'Join request'}</Badge>
            <Badge tone={STATUS_TONES[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
            <span className="text-xs text-subtle">{relativeTime(request.created_at)}</span>
          </div>
          <p className="text-sm text-muted">
            {incoming && <strong className="font-semibold text-fg">{request.person.name}</strong>}{' '}
            {headline}{' '}
            {showProject && request.project ? (
              <Link to={`/projects/${request.project.id}`} className="link">{request.project.title}</Link>
            ) : showProject ? <em>a deleted project</em> : 'this project'}
            {!incoming && request.kind === 'invitation' && <> sent to <strong className="font-semibold text-fg">{request.person.name}</strong></>}
          </p>
          {request.role && <p className="text-xs text-subtle">Role: {labelFor(ROLE_OPTIONS, request.role)}</p>}
        </div>
        <div className="shrink-0">
          <PersonLink person={request.person} size="sm" />
        </div>
      </div>

      {request.message && (
        <blockquote className="mt-4 rounded-lg border-l-2 border-brand-400/60 bg-surface-2/60 px-4 py-3 text-sm whitespace-pre-line text-muted">
          {request.message}
        </blockquote>
      )}
      {request.decision_note && (
        <p className="mt-3 text-xs text-subtle">Note from the decider: “{request.decision_note}”</p>
      )}
      {request.project && request.can_decide && (
        <p className="mt-3 text-xs text-subtle">
          Team: {request.project.member_count}/{request.project.max_team_size} members
        </p>
      )}

      {(request.can_decide || request.can_withdraw) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {request.can_decide && (
            <>
              <Button size="sm" variant="success" loading={busy === 'accept'} disabled={busy !== null}
                icon={<Check className="size-4" aria-hidden="true" />} onClick={() => run('accept')}>
                Accept
              </Button>
              <Button size="sm" variant="danger" disabled={busy !== null} icon={<X className="size-4" aria-hidden="true" />}
                onClick={() => setRejecting(true)}>
                Decline
              </Button>
            </>
          )}
          {request.can_withdraw && (
            <Button size="sm" variant="secondary" loading={busy === 'withdraw'} disabled={busy !== null}
              icon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={() => run('withdraw')}>
              Withdraw
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={request.kind === 'application' ? `Decline ${request.person.name}'s request?` : 'Decline this invitation?'}
        description="They'll be notified. This can't be undone, but they can send a new request later."
        confirmLabel="Decline"
        onConfirm={async () => {
          const updated = await rejectRequest(request.id, note.trim() || undefined)
          onChange(updated)
          refresh()
          setNote('')
          toast.info('Declined.')
        }}
      >
        <Field label="Note" optional hint="Shared with them, e.g. “The team is full for this hackathon”.">
          <TextArea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </article>
  )
}
