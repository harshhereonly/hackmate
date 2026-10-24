import { useState } from 'react'
import { Flag } from 'lucide-react'
import type { ReportReason, ReportTargetType } from '../types/api'
import { createReport } from '../services/social'
import { getErrorMessage } from '../services/api'
import { REPORT_REASON_OPTIONS } from '../utils/constants'
import { Button } from './ui/Button'
import { Field, Select, TextArea } from './ui/Field'
import { Modal } from './ui/Modal'
import { useToast } from './ui/Toast'

interface ReportDialogProps {
  open: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string
  targetLabel: string
}

export function ReportDialog({ open, onClose, targetType, targetId, targetLabel }: ReportDialogProps) {
  const toast = useToast()
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!reason) {
      setError('Choose a reason for the report.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createReport(targetType, targetId, reason, details.trim())
      toast.success('Report sent. A moderator will review it.')
      setReason('')
      setDetails('')
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
      title="Report to moderators"
      description={`You're reporting: ${targetLabel}. Reports are confidential; the person won't see who reported them.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy} icon={<Flag className="size-4" aria-hidden="true" />}>
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" required error={error && !reason ? error : undefined}>
          <Select
            data-autofocus
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason)}
            options={REPORT_REASON_OPTIONS}
            placeholder="Choose a reason"
          />
        </Field>
        <Field label="Details" optional hint="Anything that helps moderators understand the problem.">
          <TextArea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={3} />
        </Field>
        {error && reason && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
