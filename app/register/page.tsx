import Link from 'next/link'
import Image from 'next/image'
import { RegisterForm } from '@/components/auth/register-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'สมัครใช้งาน — KorKru' }

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <Link href="/" className="mb-8">
        <Image src="/logo.png" alt="KorKru" width={120} height={48} className="h-14 w-auto object-contain" />
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">สมัครใช้งาน</CardTitle>
          <CardDescription>เริ่มสร้างโจทย์ฟิสิกส์ได้เลย ฟรี!</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  )
}
