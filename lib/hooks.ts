import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

// Client Dashboard
export function useClientDashboard() {
  const { data, error, isLoading, mutate } = useSWR('/api/client/dashboard', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000, // 30 seconds
  })
  return { data, error, isLoading, mutate }
}

// Client Products (with pagination)
export function useClientProducts(params: {
  page?: number
  limit?: number
  search?: string
} = {}) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.search) searchParams.set('search', params.search)

  const queryString = searchParams.toString()
  const url = queryString ? `/api/client/products?${queryString}` : '/api/client/products'

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  return {
    products: data?.products || [],
    pagination: data?.pagination || null,
    error,
    isLoading,
    mutate
  }
}

// Client Upload Logs
export function useClientUploadLogs(type: 'shipping' | 'receiving') {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/client/upload?type=${type}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )
  return {
    logs: data?.logs || [],
    error,
    isLoading,
    mutate
  }
}

// Admin Dashboard
export function useAdminDashboard() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/dashboard', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  return { data, error, isLoading, mutate }
}

// Admin Clients
export function useAdminClients() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/clients', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  return {
    clients: data?.clients || [],
    error,
    isLoading,
    mutate
  }
}

// Admin Users
export function useAdminUsers() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/users', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  return {
    users: data?.users || [],
    clients: data?.clients || [],
    error,
    isLoading,
    mutate
  }
}

// Admin Logs
export function useAdminLogs(params: {
  logLevel?: string
  category?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.logLevel && params.logLevel !== 'all') searchParams.set('logLevel', params.logLevel)
  if (params.category && params.category !== 'all') searchParams.set('category', params.category)
  if (params.startDate) searchParams.set('startDate', params.startDate)
  if (params.endDate) searchParams.set('endDate', params.endDate)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))

  const url = `/api/admin/logs?${searchParams.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000, // 10 seconds for logs
  })

  return {
    logs: data?.logs || [],
    pagination: data?.pagination,
    error,
    isLoading,
    mutate
  }
}

// Admin Settings (Google Drive)
export function useAdminDriveSettings() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/settings/google-drive', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 minute
  })
  return {
    settings: data?.settings,
    error,
    isLoading,
    mutate
  }
}
