'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileText, Loader2, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ImportQuestionsButton } from '@/components/questions/import-questions-button'
import { withBackHref } from '@/lib/back-link'
import styles from './import-choice.module.css'

/**
 * The two ways โจทย์ get into the คลัง without being typed.
 *
 * Both also sit as buttons on the คลังโจทย์ page, where a teacher who already
 * knows the feature will look for them. This page is the entrance for one who
 * does not: it is what the sidebar's "นำเข้าโจทย์" points at, and it says what
 * each file is before asking anyone to pick one.
 */
export function ImportChoice() {
  const router = useRouter()

  return (
    <div className="grid grid-cols-1 gap-3 @min-[42rem]:grid-cols-2">
      <Card radius="md" padding="none" interactive className={`${styles.card} ${styles.word}`}>
        <div className={styles.header}>
          <FileText aria-hidden="true" focusable="false" strokeWidth={1.35} className={styles.watermark} />
          <h2 className={styles.title}>จากไฟล์ Word <span className={styles.format}>.docx</span></h2>
        </div>
        <div className={styles.body}>
          <p className={styles.description}>
            นำเข้าแบบฝึกหัดหรือข้อสอบที่พิมพ์ไว้แล้ว
          </p>
          <Link
            href={withBackHref('/questions/import/word', '/questions/import')}
            aria-label="เลือกประเภทโจทย์เพื่อนำเข้าจากไฟล์ Word .docx"
            className={styles.action}
          >
            เลือกประเภทโจทย์ <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </Card>

      <ImportQuestionsButton onImported={() => router.refresh()}>
        {({ open, isPending }) => (
          <Card radius="md" padding="none" interactive data-pending={isPending || undefined} className={`${styles.card} ${styles.korkru}`}>
            <div className={styles.header}>
              <PackageOpen aria-hidden="true" focusable="false" strokeWidth={1.35} className={styles.watermark} />
              <h2 className={styles.title}>จากไฟล์ KorKru <span className={styles.format}>.korkru.json</span></h2>
            </div>
            <div className={styles.body}>
              <p className={styles.description}>
                ย้ายโจทย์ข้ามบัญชี หรือรับไฟล์จากครูคนอื่น
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={open}
                disabled={isPending}
                aria-busy={isPending}
                aria-label={isPending ? 'กำลังนำเข้าโจทย์จากไฟล์ KorKru' : 'เลือกไฟล์ KorKru .korkru.json เพื่อนำเข้าโจทย์'}
                className={styles.action}
              >
                {isPending ? 'กำลังนำเข้า...' : 'เลือกไฟล์ KorKru'}
                {isPending
                  ? <Loader2 aria-hidden="true" data-icon="inline-end" className="motion-safe:animate-spin" />
                  : <ArrowRight aria-hidden="true" data-icon="inline-end" />}
              </Button>
            </div>
          </Card>
        )}
      </ImportQuestionsButton>
    </div>
  )
}
