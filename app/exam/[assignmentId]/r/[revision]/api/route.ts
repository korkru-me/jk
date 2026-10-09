import { type NextRequest } from 'next/server'
import { sebExamApiSchema, sebExamOperationObject } from '@/lib/seb-exam-api'
import { readBoundedExamBody, EXAM_PRIVATE_HEADERS } from '@/lib/seb-exam-http'
import { readSebExamContext, validateSebExamContextCsrf } from '@/lib/seb-exam-context.server'
import { readCurrentAssignmentSebRelease } from '@/lib/seb-assignment-release.server'
import { readWaitingSebProfile, waitingSebFeatureEnabled } from '@/lib/seb-waiting-release-policy'
import { authorizeWaitingExam, authorizeWaitingObject, readWaitingExamData, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { sebExamRoutePath } from '@/lib/seb-exam-transport-policy'
import { verifySafeExamBrowser } from '@/lib/actions/seb'
import * as submissions from '@/lib/actions/submissions'
import * as attachments from '@/lib/actions/exam-attachments'
import * as work from '@/lib/actions/math-work'
import { recordProctorSignal } from '@/lib/actions/exam-proctor'
import { passwordLoginForWaiting, prepareWaitingGoogleLogin, sendWaitingMagicLink, completeWaitingStudentProfile } from '@/lib/seb-exam-auth.server'
import { signWaitingUploadTarget } from '@/lib/seb-exam-resource.server'
import { readWaitingCompletion } from '@/lib/seb-exam-completion.server'

export const dynamic = 'force-dynamic'
const failure = (status = 403) => Response.json({ error: 'คำขอห้องสอบไม่ถูกต้องหรือหมดอายุ กรุณาตรวจเครื่องใหม่' }, { status, headers: EXAM_PRIVATE_HEADERS })

export async function POST(request: NextRequest, { params }: { params: Promise<SebWaitingRouteParams> }) {
  if (!waitingSebFeatureEnabled(process.env)) return failure()
  const scope = await params
  const state = await readSebExamContext({ assignmentId: scope.assignmentId, revision: Number(scope.revision) })
  if (state.status !== 'valid' || request.headers.has('next-action') || request.nextUrl.search
    || !validateSebExamContextCsrf(request.headers.get('x-korkru-seb-csrf') ?? undefined, state.claims)) return failure()
  const context = state.claims
  const release = await readCurrentAssignmentSebRelease(context.assignmentId)
  const profile = release ? readWaitingSebProfile(release) : null
  if (!release || !profile || release.releaseId !== context.releaseId || release.revision !== context.revision
    || request.nextUrl.origin !== profile.origin || request.headers.get('origin') !== profile.origin) return failure()
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return failure(415)
  const bytes = await readBoundedExamBody(request, 4 * 1024 * 1024)
  if (!bytes) return failure(413)
  let input: unknown
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { return failure(400) }
  const parsed = sebExamApiSchema.safeParse(input)
  if (!parsed.success) return failure(400)
  const operation = parsed.data
  try {
    let result: unknown
    switch (operation.operation) {
      case 'login': result = await passwordLoginForWaiting(operation.args[0]); break
      case 'google': result = await prepareWaitingGoogleLogin(); break
      case 'magic': result = await sendWaitingMagicLink(operation.args[0]); break
      case 'profile': result = await completeWaitingStudentProfile(operation.args[0]); break
      default: {
        const access = await authorizeWaitingExam(scope)
        if (!access.ok || !access.account.survey_role || access.context.contextId !== context.contextId) return failure()
        if (operation.operation === 'submitSubmission') {
          const committed = await readWaitingCompletion(scope)
          if (committed?.receipt.id === operation.args[0] && committed.context.contextId === context.contextId) {
            return Response.json({ result: { success: true } }, { headers: EXAM_PRIVATE_HEADERS })
          }
        }
        const object = sebExamOperationObject(operation)
        if (object && !await authorizeWaitingObject(context, object.kind, object.id)) {
          // The countdown may fire just after the write deadline. Recover only
          // this exact expired native attempt; never waive ownership/session.
          if (operation.operation !== 'submitSubmission'
            || !await authorizeWaitingObject(context, 'submission', operation.args[0], { allowExpired: true })) return failure()
          const finalized = await submissions.finalizeExpiredSebSubmission(operation.args[0])
          return Response.json({ result: finalized }, { headers: EXAM_PRIVATE_HEADERS })
        }
        switch (operation.operation) {
          case 'verify': result = await verifySafeExamBrowser({ ...operation.args[0], assignmentId: context.assignmentId, purpose: 'system_check' }); break
          case 'start': {
            result = await submissions.startSubmission(context.assignmentId, undefined, undefined, operation.args[0])
            if (result && typeof result === 'object' && 'submissionId' in result && typeof result.submissionId === 'string' && result.submissionId && !('error' in result && result.error)) {
              if (!('alreadySubmitted' in result && result.alreadySubmitted)) {
                if (!await authorizeWaitingObject(context, 'submission', result.submissionId)) return failure()
              }
              result = { success: true, href: sebExamRoutePath(context, 'alreadySubmitted' in result && result.alreadySubmitted ? 'submitted' : 'take') }
            }
            break
          }
          case 'resume': {
            const current = await readWaitingExamData(scope)
            if (!current.ok || !current.view.canResume) return failure()
            if (current.view.needsFinalization) {
              const { data: active, error } = await access.admin.from('submissions').select('id')
                .eq('assignment_id', context.assignmentId).eq('student_id', access.user.id).eq('status', 'in_progress')
                .eq('exam_access_mode', 'seb').eq('seb_config_revision', context.revision).maybeSingle()
              if (error || !active) return failure()
              const finalized = await submissions.finalizeExpiredSebSubmission(active.id)
              result = finalized.success ? { success: true, href: sebExamRoutePath(context, 'submitted') } : finalized
              break
            }
            // This existing branch only resumes/finalizes a known active receipt;
            // never allow this operation to fall through to creation.
            const resumed = await submissions.startSubmission(context.assignmentId)
            if (resumed.submissionId && !resumed.error && !resumed.alreadySubmitted) {
              if (!await authorizeWaitingObject(context, 'submission', resumed.submissionId)) return failure()
            }
            result = resumed.submissionId && !resumed.error ? { success: true, href: sebExamRoutePath(context, resumed.alreadySubmitted ? 'submitted' : 'take') } : resumed
            break
          }
          case 'saveAnswer': result = await submissions.saveAnswer(...operation.args); break
          case 'saveWorkImage': result = await submissions.saveWorkImage(...operation.args); break
          case 'checkAnswer': result = await submissions.checkAnswer(...operation.args); break
          case 'rerollCheckedRandomAnswer': result = await submissions.rerollCheckedRandomAnswer(...operation.args); break
          case 'drawNextStreakQuestion': return failure()
          case 'submitSubmission': result = await submissions.submitSubmission(...operation.args); break
          case 'recordProctorSignal': result = await recordProctorSignal(...operation.args); break
          case 'prepareExamAttachmentUpload': {
            const prepared = await attachments.prepareExamAttachmentUpload(...operation.args)
            if ('path' in prepared && prepared.path) {
              const receipt = await signWaitingUploadTarget(context, operation.args[0].submissionAnswerId, prepared)
              if (!receipt) return failure()
              result = { ...prepared, examUploadReceipt: receipt }
            } else result = prepared
            break
          }
          case 'completeExamAttachmentUpload': result = await attachments.completeExamAttachmentUpload(...operation.args); break
          case 'deleteExamAttachment': result = await attachments.deleteExamAttachment(...operation.args); break
          case 'prepareStudentWorkArtifactUpload': {
            const prepared = await work.prepareStudentWorkArtifactUpload(...operation.args)
            if ('preview' in prepared) {
              const receipt = await signWaitingUploadTarget(context, operation.args[0].submissionAnswerId, prepared)
              if (!receipt) return failure()
              result = { ...prepared, preview: { ...prepared.preview, examUploadReceipt: receipt } }
            } else result = prepared
            break
          }
          case 'saveStudentWorkArtifact': result = await work.saveStudentWorkArtifact(...operation.args); break
          case 'getStudentWorkArtifacts': result = await work.getStudentWorkArtifacts(...operation.args); break
          case 'deleteStudentWorkArtifact': result = await work.deleteStudentWorkArtifact(...operation.args); break
        }
      }
    }
    return Response.json({ result }, { headers: EXAM_PRIVATE_HEADERS })
  } catch { return failure(503) }
}
