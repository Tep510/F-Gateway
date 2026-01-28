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

  useEffect(() => {
    if (currentRole && currentRole !== role) {
      alert(`この画面には「${role === "admin" ? "管理者" : "クライアント"}」ロールが必要です。現在のロールは「${currentRole === "admin" ? "管理者" : "クライアント"}」です。`)
      router.replace(currentRole === "admin" ? "/admin" : "/client")
    }
  }, [currentRole, role, router])

  if (currentRole !== role) return null

  return <>{children}</>
}
