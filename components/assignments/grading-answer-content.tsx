import type { GradingAnswer } from '@/lib/grading-workspace'
import type { ClassifyConfig, CompositeConfig, ImageLabelConfig, MatchingPair, OrderingConfig, Question, TrueFalseConfig } from '@/lib/types'
import { parseSubmittedFiles } from '@/lib/exam-attachment'
import { choiceLabel } from '@/lib/submission-choice-review'
import { QuestionText, SubmissionAnswerReview } from '@/components/student/submission-answer-review'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { gradingAssetUrl as displayUrl } from './grading-asset-url'
import { GradingPdfPreview } from './grading-pdf-preview'

function ImagePreview({ url, label }: { url: string; label: string }) {
  const safe = displayUrl(url)
  if (!safe) return <p className="text-xs text-muted-foreground">ไม่สามารถแสดงภาพนี้ได้</p>
  return <figure className="flex min-w-0 flex-col gap-1">
    <a href={safe} target="_blank" rel="noopener noreferrer" aria-label={`เปิดภาพขนาดเต็ม: ${label}`} className="block w-fit max-w-full rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      {/* Student work is visible in full immediately; the link only offers enlargement. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={safe} alt={label} loading="lazy" decoding="async" className="h-auto max-h-[34rem] w-auto max-w-full rounded-lg border border-border object-contain" />
    </a>
    <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
  </figure>
}

function FilePreview({ url, name, pdf }: { url: string; name: string; pdf: boolean }) {
  const safe = displayUrl(url)
  if (!safe) return <p className="text-xs text-muted-foreground">ไม่สามารถแสดงไฟล์ {name} ได้</p>
  if (!pdf) return <ImagePreview url={safe} label={name} />
  return <GradingPdfPreview url={safe} name={name} />
}

function substitute(text: string, values: Record<string, number> = {}) {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => name in values ? String(values[name]) : match)
}

function questionImages(urls: string[] = []) {
  return urls.length > 0 ? <div className="grid min-w-0 gap-2 sm:grid-cols-2">{urls.map((url, index) => <FilePreview key={`${url}-${index}`} url={url} name={`รูปประกอบ ${index + 1}`} pdf={/\.pdf(?:[?#]|$)/i.test(url)} />)}</div> : null
}

function optionsContent(options: Question['mcq_options'], order?: number[] | null) {
  const displayed = order?.length && options ? order.map(index => options[index]).filter(Boolean) : options
  return displayed?.length ? <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{displayed.map((option, index) => <li key={index} className="flex min-w-0 items-start gap-2 text-sm">
    <span className="shrink-0 font-medium">{choiceLabel(index)}.</span>
    <div className="flex min-w-0 flex-col gap-1"><QuestionText text={option.text} />{option.image_url && <ImagePreview url={option.image_url} label={`ตัวเลือก ${choiceLabel(index)}`} />}</div>
  </li>)}</ol> : null
}

function DiagramPreview({ diagram }: { diagram: ImageLabelConfig }) {
  const safe = displayUrl(diagram.image_url)
  if (!safe) return <p className="text-xs text-muted-foreground">ไม่สามารถแสดงภาพโจทย์ได้</p>
  return <figure className="flex min-w-0 flex-col gap-1"><div className="relative w-fit max-w-full">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={safe} alt="ภาพโจทย์เติมคำพร้อมหมายเลขจุด" loading="lazy" decoding="async" className="h-auto max-h-[34rem] w-auto max-w-full rounded-lg border border-border object-contain" />
    {diagram.markers?.map((marker, index) => <span key={marker.id} title={marker.label || `จุดที่ ${index + 1}`} style={{ left: `${Math.max(0, Math.min(100, marker.point.x))}%`, top: `${Math.max(0, Math.min(100, marker.point.y))}%` }} className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-card/90 text-xs font-semibold text-primary">{index + 1}</span>)}
  </div><figcaption className="text-xs text-muted-foreground">หมายเลขจุดตรงกับลำดับคำตอบด้านล่าง</figcaption></figure>
}

/** A read-only question, using the attempt's actual values and option order. */
export function GradingQuestionContent({ question, answer }: { question: Question; answer?: GradingAnswer }) {
  const extra = answer?.gradingConfig?.extra_data ?? question.extra_data ?? {}
  const values = answer?.randomValues ?? {}
  const parts = answer?.gradingConfig?.answer_parts ?? question.answer_parts
  const trueFalse = extra as TrueFalseConfig
  const composite = extra as CompositeConfig
  const classify = extra as ClassifyConfig
  const ordering = extra as OrderingConfig
  const diagram = extra as ImageLabelConfig
  return <div className="flex min-w-0 flex-col gap-2 text-sm [&_.rich-text-content_img]:h-auto [&_.rich-text-content_img]:max-w-full">
    {question.question_type === 'true_false' && trueFalse.prompt && <QuestionText text={substitute(trueFalse.prompt, values)} />}
    <QuestionText text={substitute(question.question_text, values)} />
    {questionImages(question.image_urls)}
    {question.question_type === 'mcq' && optionsContent(question.mcq_options, answer?.optionOrder)}
    {question.question_type === 'written' && parts?.some(part => part.sub_text?.trim()) && <ol className="flex flex-col gap-1">{parts.map((part, index) => part.sub_text?.trim() ? <li key={part.id || index} className="flex gap-2"><span>{choiceLabel(index)}.</span><QuestionText text={substitute(part.sub_text, values)} /></li> : null)}</ol>}
    {question.question_type === 'true_false' && trueFalse.statements?.map((statement, index) => <div key={statement.id} className="flex gap-2"><span>{choiceLabel(index + 1)}.</span><QuestionText text={substitute(statement.text, values)} /></div>)}
    {question.question_type === 'matching' && <div className="grid grid-cols-2 gap-x-4 gap-y-1">{(question.mcq_options as unknown as MatchingPair[] | null)?.map((pair, index) => <div key={index} className="contents"><div className="flex min-w-0 flex-col gap-1"><QuestionText text={pair.left_text} />{pair.left_image && <ImagePreview url={pair.left_image} label={`รูปด้านซ้าย ${index + 1}`} />}</div><div className="flex min-w-0 flex-col gap-1"><QuestionText text={pair.right_text} />{pair.right_image && <ImagePreview url={pair.right_image} label={`รูปด้านขวา ${index + 1}`} />}</div></div>)}</div>}
    {question.question_type === 'ordering' && ordering.items?.map((item, index) => <div key={item.id} className="flex flex-col gap-1"><QuestionText text={`${index + 1}. ${item.text}`} />{item.image_url && <ImagePreview url={item.image_url} label={`ภาพรายการ ${index + 1}`} />}</div>)}
    {question.question_type === 'image_label' && diagram.image_url && <><DiagramPreview diagram={diagram} />{diagram.bank?.length ? <p className="text-xs text-muted-foreground">คลังคำ: {diagram.bank.join(' · ')}</p> : null}</>}
    {question.question_type === 'composite' && composite.parts?.map((part, index) => <div key={part.id} className="flex flex-col gap-1 border-l-2 border-border pl-3"><p className="text-xs font-medium text-muted-foreground">ข้อย่อย {choiceLabel(index)}</p><QuestionText text={substitute(part.text, values)} />{questionImages(part.image_urls)}{part.type === 'mcq' && optionsContent(part.options ?? null)}{part.items?.map(item => <QuestionText key={item.id} text={item.text} />)}{part.choices?.map(choice => <QuestionText key={choice.id} text={choice.text} />)}</div>)}
    {question.question_type === 'classify' && classify.rows && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="px-2 py-1">รายการ</th>{classify.columns?.map(column => <th key={column.id} className="px-2 py-1">{column.title}<span className="block font-normal text-muted-foreground">{column.options.join(' / ')}</span></th>)}</tr></thead><tbody>{classify.rows.map(row => <tr key={row.id}><td className="px-2 py-1"><QuestionText text={row.text} />{questionImages(row.image_urls)}</td>{classify.columns?.map(column => <td key={column.id} className="px-2 py-1 text-muted-foreground">—</td>)}</tr>)}</tbody></table></div>}
    {question.question_type === 'file_upload' && Array.isArray((extra as Record<string, unknown>).attachment_urls) && <div className="grid gap-2 sm:grid-cols-2">{((extra as { attachment_urls: string[] }).attachment_urls).map((url, index) => <FilePreview key={`${url}-${index}`} url={url} name={`ไฟล์ประกอบโจทย์ ${index + 1}`} pdf={/\.pdf(?:[?#]|$)/i.test(url)} />)}</div>}
  </div>
}

export function GradingAnswerContent({ question, answer, showQuestionVariant = true, workLabel = 'วิธีทำที่แนบ' }: { question: Question; answer: GradingAnswer; showQuestionVariant?: boolean; workLabel?: string }) {
  const files = question.question_type === 'file_upload' ? parseSubmittedFiles(answer.studentAnswer) : null
  const options = question.question_type === 'matching' ? question.mcq_options : answer.optionOrder?.length && question.mcq_options ? answer.optionOrder.map(index => question.mcq_options?.[index]).filter((option): option is NonNullable<typeof option> => !!option) : question.mcq_options
  const safeOptions = options?.map(option => ({ ...option, image_url: displayUrl(option.image_url) ?? undefined, ...('left_image' in option ? { left_image: displayUrl(option.left_image as string) ?? undefined } : {}) })) ?? null
  const artifacts = answer.workArtifacts ?? []
  const workImages = answer.workImages.filter((url): url is string => !!url)
  return <div className="flex min-w-0 flex-col gap-2">
    {Object.keys(answer.randomValues).length > 0 && <div className="flex flex-col gap-1"><div className="flex flex-wrap gap-1">{Object.entries(answer.randomValues).map(([name, value]) => <Badge key={name} variant="secondary">{name} = {value}</Badge>)}</div>{showQuestionVariant && <QuestionText text={substitute(question.question_text, answer.randomValues)} className="text-xs text-muted-foreground" />}</div>}
    {question.question_type === 'file_upload' ? files?.length ? <div className="grid min-w-0 gap-3">{files.map((file, index) => <FilePreview key={`${file.url}-${index}`} url={file.url} name={file.name} pdf={file.type === 'application/pdf'} />)}</div> : <p className="text-sm text-muted-foreground">{files === null && answer.studentAnswer ? 'ไม่สามารถอ่านรายการไฟล์ที่ส่งได้' : 'ไม่ได้ส่งไฟล์งาน'}</p> : <div className="min-w-0 [&>div]:mt-0 [&_p]:break-words">
      <SubmissionAnswerReview studentAnswer={answer.studentAnswer} correctAnswer={answer.correctAnswer} isCorrect={answer.isCorrect} answerParts={answer.gradingConfig?.answer_parts ?? question.answer_parts} answerUnit={question.answer_unit} questionType={question.question_type} extraData={(answer.gradingConfig?.extra_data ?? question.extra_data) as Record<string, unknown>} mcqOptions={safeOptions} workImages={null} />
    </div>}
    {(workImages.length > 0 || artifacts.length > 0) && <section aria-label={workLabel} className="flex min-w-0 flex-col gap-2"><p className="text-xs font-medium text-muted-foreground">วิธีทำที่แนบ</p><div className="grid min-w-0 gap-3">{workImages.map((url, index) => <ImagePreview key={`${url}-${index}`} url={url} label={`ภาพวิธีทำ ${index + 1}`} />)}{artifacts.map(artifact => artifact.previewUrl ? <ImagePreview key={artifact.id} url={artifact.previewUrl} label={`${artifact.partKey.startsWith('part:') ? `ข้อย่อย ${Number(artifact.partKey.slice(5)) + 1} · ` : ''}${artifact.sourceType === 'scratchpad' ? 'กระดาษทดที่แนบ' : 'ภาพวิธีทำ'}`} /> : <Card key={artifact.id} radius="sm" padding="sm"><p className="text-xs text-muted-foreground">เปิดภาพวิธีทำไม่สำเร็จ กรุณาลองโหลดหน้าใหม่</p></Card>)}</div></section>}
  </div>
}
