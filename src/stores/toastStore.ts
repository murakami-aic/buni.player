import { create } from "zustand";

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  leaving: boolean;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 4;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) =>
    set((state) => {
      const id = crypto.randomUUID();
      const next = [...state.toasts, { id, type, message, leaving: false }];
      if (next.length > MAX_TOASTS) {
        next.splice(0, next.length - MAX_TOASTS);
      }
      return { toasts: next };
    }),
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, leaving: true } : t,
      ),
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 200);
  },
}));
