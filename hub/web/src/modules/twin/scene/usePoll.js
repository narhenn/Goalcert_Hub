// usePoll — re-run an async fetcher on an interval (near-live panels with no SSE).
// Ported from the NextXR frontend's usePolling; trimmed to what the 3-D viewer needs.
import { useCallback, useEffect, useRef, useState } from 'react'

// useApi — run an async fetcher once (re-runs when deps change).
export function useApi(fetcher, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const run = useCallback(async () => {
    try { setData(await fetcherRef.current()) } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (skip) return
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, refetch: run }
}

export function usePolling(fetcher, intervalMs = 3000, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(async () => {
    try {
      setData(await fetcherRef.current())
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    if (skip) return
    run()
    const id = setInterval(run, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, skip])

  return { data, error, refetch: run }
}
