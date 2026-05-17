import { createFileRoute } from '@tanstack/react-router'
import SmartHomeDashboard from '@/components/SmartHomeDashboard'

export const Route = createFileRoute('/')({
  component: SmartHomeDashboard,
})
