import { create } from 'zustand'

/**
 * One toast at a time, with an optional action button. The tracker never asks
 * "are you sure?" on capture — it saves immediately and offers Undo here.
 */

export interface Toast {
  id: number
  msg: string
  action?: { label: string; fn: () => void }
}

interface ToastState {
  toast: Toast | null
  show: (msg: string, action?: Toast['action']) => void
  dismiss: () => void
}

let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null

export const useToast = create<ToastState>((set) => ({
  toast: null,

  show: (msg, action) => {
    if (timer) clearTimeout(timer)
    const id = ++seq
    set({ toast: { id, msg, action } })
    timer = setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s))
      timer = null
    }, 4500)
  },

  dismiss: () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    set({ toast: null })
  },
}))
