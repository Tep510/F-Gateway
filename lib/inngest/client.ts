import { Inngest, EventSchemas } from 'inngest'

// Define event types for type safety
type Events = {
  'product/import.requested': {
    data: {
      importLogId: number
      clientId: number
      fileName: string
      blobUrl: string
    }
  }
}

// Create Inngest client with event schemas
export const inngest = new Inngest({
  id: 'f-gateway',
  name: 'F-Gateway',
  schemas: new EventSchemas().fromRecord<Events>(),
})
