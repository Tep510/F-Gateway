"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

interface RoleGuardProps {
  role: string
  currentRole: string | undefined
  children: React.ReactNode
}

export default function RoleGuard({ role, currentRole, children }: RoleGuardProps) {
  const router = useRouter()

  // Admin can access all pages. Only block client trying to access admin.
  const isAllowed = currentRole === "admin" || currentRole === role

  useEffect(() => {
    if (currentRole && !isAllowed) {
      alert(`この画面には「管理者」ロールが必要です。現在のロールは「クライアント」です。`)
      router.replace("/client")
    }
  }, [currentRole, isAllowed, router])

  if (!isAllowed) return null

  return <>{children}</>
}
