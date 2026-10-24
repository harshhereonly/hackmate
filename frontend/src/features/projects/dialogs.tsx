import { useState } from 'react'
import { useNavigate } from 'react-router'
import { MessageSquare, Send, UserPlus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, Select, TextArea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { EmptyState, Spinner } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../services/api'
import { inviteToProject, listMyProjects, requestToJoin } from '../../services/projects'
import { openDirectConversation } from '../../services/social'
import type { JoinRequest, Role } from '../../types/api'
import { ROLE_OPTIONS, labelFor } from '../../utils/constants'
import { useActivity } from '../notifications/ActivityContext'

function roleOptions(preferred: Role[]) {
  const first = ROLE_OPTIONS.filter((option) => preferred.includes(option.value))
  const rest = ROLE_OPTIONS.filter((option) => !preferred.includes(option.value))
  return [...first, ...rest]
}

export function JoinRequestDialog({ open, onClose, project, onSubmitted }: {
  open: boolean
  onClose: () => void
  project: { id: string; title: string; roles_needed: Role[] }
  onSubmitted: (request: JoinRequest) => void
}) {
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const request = await requestToJoin(project.id, message.trim(), role || null)
      toast.success('Request sent. The owner will be notified.')
      setMessage('')
      setRole('')
      onSubmitted(request)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      title={`Request to join ${project.title}`}
      description="Tell the owner what you'd bring. Your profile is shared with them so they can review your request."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} icon={<Send className="size-4" aria-hidden="true" />}>Send request</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role you'd like" optional hint={project.roles_needed.length ? `Looking for: ${project.roles_needed.map((r) => labelFor(ROLE_OPTIONS, r)).join(', ')}` : undefined}>
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)} options={roleOptions(project.roles_needed)} placeholder="No specific role" />
        </Field>
        <Field label="Message" optional hint={`${message.length}/1000`}>
          <TextArea
            data-autofocus
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="Hi! I'd love to help with… I've worked on…"
          />
        </Field>
        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

export function InviteDialog({ open, onClose, handle, name }: { open: boolean; onClose: () => void; handle: string; name: string }) {
  const toast = useToast()
  const { data, loading, error: loadError } = useApi((signal) => listMyProjects('owner', 1, signal), [], { enabled: open })
  const projects = (data?.items ?? []).filter((p) => p.status !== 'completed' && !p.is_removed && p.open_spots > 0)
  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = projects.find((p) => p.id === projectId)

  const submit = async () => {
    if (!projectId) {
      setError('Choose one of your projects.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await inviteToProject(projectId, handle, message.trim(), role || null)
      toast.success(`Invitation sent to ${name}.`)
      setMessage('')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      title={`Invite ${name} to a project`}
      description="They'll get a notification and can accept or decline."
      footer={
        projects.length > 0 ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} loading={busy} icon={<UserPlus className="size-4" aria-hidden="true" />}>Send invitation</Button>
          </>
        ) : undefined
      }
    >
      {loading ? (
        <Spinner label="Loading your projects" />
      ) : loadError ? (
        <p role="alert" className="text-sm text-danger">{loadError.message}</p>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects with open spots"
          description="Create a project (or increase a project's team size) to invite people."
          className="py-8"
        />
      ) : (
        <div className="space-y-4">
          <Field label="Project" required>
            <Select
              data-autofocus
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              options={projects.map((p) => ({ value: p.id, label: `${p.title} (${p.open_spots} open)` }))}
              placeholder="Choose a project"
            />
          </Field>
          <Field label="Role" optional>
            <Select value={role} onChange={(event) => setRole(event.target.value as Role)} options={roleOptions(selected?.roles_needed ?? [])} placeholder="No specific role" />
          </Field>
          <Field label="Message" optional hint={`${message.length}/1000`}>
            <TextArea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={4} placeholder="Why you think they'd be a great fit…" />
          </Field>
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

/** Opens (or creates) a direct conversation. The server enforces who may message whom. */
export function MessageButton({ handle, variant = 'secondary', size = 'sm', label = 'Message' }: {
  handle: string
  variant?: 'secondary' | 'primary' | 'ghost'
  size?: 'sm' | 'md'
  label?: string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh } = useActivity()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      size={size}
      loading={busy}
      icon={<MessageSquare className="size-4" aria-hidden="true" />}
      onClick={async () => {
        setBusy(true)
        try {
          const conversation = await openDirectConversation(handle)
          refresh()
          navigate(`/messages/${conversation.id}`)
        } catch (err) {
          toast.error(getErrorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {label}
    </Button>
  )
}
