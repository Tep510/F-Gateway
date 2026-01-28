import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { processProductImport } from '@/lib/inngest/functions'

// Create an API that hosts Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processProductImport,
  ],
})
