import type { FieldError, UseFormRegisterReturn } from 'react-hook-form'

import { Field, FieldError as FieldErrorMessage, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  CLASS_NUMBER_MAX,
  GRADE_LEVELS,
  SECTION_NUMBERS,
  STUDENT_CODE_MAX_LENGTH,
  STUDENT_EDUCATION_FIELDS,
  type StudentEducationField,
} from '@/lib/student-education'

export function StudentEducationFields({ register, errors, disabled }: {
  register: (name: StudentEducationField) => UseFormRegisterReturn<StudentEducationField>
  errors: Partial<Record<StudentEducationField, FieldError>>
  disabled: boolean
}) {
  return (
    <fieldset className="@container/education min-w-0 space-y-1">
      <legend className="text-sm font-semibold">ข้อมูลการศึกษา</legend>
      <div className="grid grid-cols-1 gap-2 @min-[16rem]/education:grid-cols-2">
        {STUDENT_EDUCATION_FIELDS.map(({ name, label }) => {
          const error = errors[name]
          const errorId = `${name}-error`
          const props = {
            id: name,
            disabled,
            required: true,
            className: 'min-h-11',
            'aria-invalid': Boolean(error),
            'aria-describedby': error ? errorId : undefined,
            ...register(name),
          }

          return (
            <Field key={name} data-invalid={Boolean(error)} className="min-w-0 gap-1">
              <FieldLabel htmlFor={name}>{label}</FieldLabel>
              {name === 'grade_level' ? (
                <NativeSelect {...props}>
                  <option value="">เลือกระดับชั้น</option>
                  {GRADE_LEVELS.map((grade) => <option key={grade}>{grade}</option>)}
                </NativeSelect>
              ) : name === 'section_number' ? (
                <NativeSelect {...props}>
                  <option value="">เลือกห้อง</option>
                  {SECTION_NUMBERS.map((room) => <option key={room} value={room}>ห้อง {room}</option>)}
                </NativeSelect>
              ) : name === 'student_code' ? (
                <Input {...props} maxLength={STUDENT_CODE_MAX_LENGTH} autoComplete="off" />
              ) : (
                <Input {...props} type="number" min={1} max={CLASS_NUMBER_MAX} />
              )}
              <FieldErrorMessage id={errorId} errors={[error]} />
            </Field>
          )
        })}
      </div>
    </fieldset>
  )
}
