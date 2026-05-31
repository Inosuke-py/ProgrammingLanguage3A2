import { useEffect } from 'react'

/**
 * Closes a modal/panel when Escape key is pressed.
 * @param isOpen - whether the modal is currently open
 * @param onClose - function to call when Escape is pressed
 */
export function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])
}
