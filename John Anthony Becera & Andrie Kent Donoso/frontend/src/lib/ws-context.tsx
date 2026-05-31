import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

interface WSEvent {
  event: string
  data: any
}

type EventHandler = (data: any) => void

interface WSContextType {
  isConnected: boolean
  subscribe: (event: string, handler: EventHandler) => () => void
  joinRoom: (roomId: string) => void
  leaveRoom: (roomId: string) => void
}

const WSContext = createContext<WSContextType | null>(null)

export function WSProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)

  const connect = useCallback(() => {
    const token = localStorage.getItem('kino_token')
    if (!token) return

    // Determine WS URL from current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // Send auth message
        ws.send(JSON.stringify({ type: 'auth', token }))
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSEvent = JSON.parse(event.data)

          if (msg.event === 'authenticated') {
            setIsConnected(true)
            reconnectAttempts.current = 0
          }

          // Dispatch to subscribers
          const handlers = handlersRef.current.get(msg.event)
          if (handlers) {
            handlers.forEach((handler) => handler(msg.data))
          }

          // Also dispatch to wildcard subscribers
          const wildcardHandlers = handlersRef.current.get('*')
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => handler(msg))
          }
        } catch {}
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null
        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      // WS not available, silently fail
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  // Reconnect when token changes (login/logout)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kino_token') {
        if (wsRef.current) wsRef.current.close()
        if (e.newValue) {
          setTimeout(connect, 500)
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [connect])

  const subscribe = useCallback((event: string, handler: EventHandler) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set())
    }
    handlersRef.current.get(event)!.add(handler)

    // Return unsubscribe function
    return () => {
      handlersRef.current.get(event)?.delete(handler)
    }
  }, [])

  const joinRoom = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'join_room', room_id: roomId }))
    }
  }, [])

  const leaveRoom = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave_room', room_id: roomId }))
    }
  }, [])

  return (
    <WSContext.Provider value={{ isConnected, subscribe, joinRoom, leaveRoom }}>
      {children}
    </WSContext.Provider>
  )
}

export function useWS() {
  const context = useContext(WSContext)
  if (!context) throw new Error('useWS must be used within WSProvider')
  return context
}

/**
 * Hook to subscribe to a specific WS event.
 * Automatically unsubscribes on unmount.
 */
export function useWSEvent(event: string, handler: EventHandler) {
  const { subscribe } = useWS()

  useEffect(() => {
    const unsubscribe = subscribe(event, handler)
    return unsubscribe
  }, [event, handler, subscribe])
}
