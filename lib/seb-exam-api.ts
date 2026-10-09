import { z } from 'zod'

const uuid = z.string().uuid()
const text = z.string().max(500_000)
const token = z.string().min(1).max(4096)
const partIndex = z.number().int().min(0).max(50)
const attachment = z.object({
  submissionAnswerId: uuid, kind: z.enum(['work_image', 'submission_file']), partIndex: partIndex.optional(),
  uploadId: uuid.optional(), retry: z.boolean().optional(), name: z.string().min(1).max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']), size: z.number().int().positive().max(10 * 1024 * 1024),
}).strict()
const work = z.object({
  submissionAnswerId: uuid, partKey: z.string().min(1).max(80), sourceType: z.enum(['photo', 'scratchpad']),
  includeScene: z.boolean(), formatVersion: z.number().int().positive(), previewFormat: z.enum(['png', 'webp']),
}).strict()

/** A closed JSON protocol, independent of build-specific Next Server Action IDs. */
export const sebExamApiSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('login'), args: z.tuple([z.object({ email: z.string().max(320), password: z.string().max(1024) }).strict()]) }).strict(),
  z.object({ operation: z.literal('google'), args: z.tuple([]) }).strict(),
  z.object({ operation: z.literal('magic'), args: z.tuple([z.string().max(320)]) }).strict(),
  z.object({ operation: z.literal('profile'), args: z.tuple([z.string().max(160)]) }).strict(),
  z.object({ operation: z.literal('start'), args: z.tuple([token]) }).strict(),
  z.object({ operation: z.literal('resume'), args: z.tuple([]) }).strict(),
  z.object({ operation: z.literal('verify'), args: z.tuple([z.object({ challenge: token, requestUrl: z.string().url().max(8192), configKeyHash: z.string().regex(/^[a-f0-9]{64}$/i), browserExamKeyHash: z.string().regex(/^[a-f0-9]{64}$/i), version: z.string().max(240) }).strict()]) }).strict(),
  z.object({ operation: z.literal('saveAnswer'), args: z.tuple([uuid, text, z.unknown().optional()]) }).strict(),
  z.object({ operation: z.literal('saveWorkImage'), args: z.tuple([uuid, partIndex, z.string().url().max(8192).nullable()]) }).strict(),
  z.object({ operation: z.literal('checkAnswer'), args: z.tuple([uuid]) }).strict(),
  z.object({ operation: z.literal('rerollCheckedRandomAnswer'), args: z.tuple([uuid]) }).strict(),
  z.object({ operation: z.literal('drawNextStreakQuestion'), args: z.tuple([uuid, z.object({ keepPracticing: z.boolean().optional() }).strict().optional()]) }).strict(),
  z.object({ operation: z.literal('submitSubmission'), args: z.tuple([uuid]) }).strict(),
  z.object({ operation: z.literal('recordProctorSignal'), args: z.tuple([z.object({ submissionId: uuid, clientInstanceId: uuid, tabVisible: z.boolean(), fullscreen: z.boolean(), connectionClosed: z.boolean().optional(), events: z.array(z.unknown()).max(100) }).strict()]) }).strict(),
  z.object({ operation: z.literal('prepareExamAttachmentUpload'), args: z.tuple([attachment]) }).strict(),
  z.object({ operation: z.literal('completeExamAttachmentUpload'), args: z.tuple([attachment.omit({ retry: true }).extend({ uploadId: uuid })]) }).strict(),
  z.object({ operation: z.literal('deleteExamAttachment'), args: z.tuple([z.object({ submissionAnswerId: uuid, kind: z.enum(['work_image', 'submission_file']), partIndex: partIndex.optional(), url: z.string().url().max(8192) }).strict()]) }).strict(),
  z.object({ operation: z.literal('prepareStudentWorkArtifactUpload'), args: z.tuple([work.extend({ scene: z.unknown().optional() })]) }).strict(),
  z.object({ operation: z.literal('saveStudentWorkArtifact'), args: z.tuple([work.extend({ uploadId: uuid, uploadReceipt: token })]) }).strict(),
  z.object({ operation: z.literal('getStudentWorkArtifacts'), args: z.tuple([uuid]) }).strict(),
  z.object({ operation: z.literal('deleteStudentWorkArtifact'), args: z.tuple([uuid]) }).strict(),
])

export type SebExamApiRequest = z.infer<typeof sebExamApiSchema>

export function sebExamOperationObject(request: SebExamApiRequest): { kind: 'answer' | 'submission' | 'artifact'; id: string } | null {
  switch (request.operation) {
    case 'saveAnswer': case 'saveWorkImage': case 'checkAnswer': case 'rerollCheckedRandomAnswer': case 'getStudentWorkArtifacts':
      return { kind: 'answer', id: request.args[0] }
    case 'submitSubmission': case 'drawNextStreakQuestion': return { kind: 'submission', id: request.args[0] }
    case 'recordProctorSignal': return { kind: 'submission', id: request.args[0].submissionId }
    case 'deleteStudentWorkArtifact': return { kind: 'artifact', id: request.args[0] }
    case 'prepareExamAttachmentUpload': case 'completeExamAttachmentUpload': case 'deleteExamAttachment':
    case 'prepareStudentWorkArtifactUpload': case 'saveStudentWorkArtifact':
      return { kind: 'answer', id: request.args[0].submissionAnswerId }
    default: return null
  }
}
