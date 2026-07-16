import { useEffect } from "react";
import { Check, Info, X, type LucideIcon } from "lucide-react";
import { useToastStore } from "../../stores/toastStore";
import type { Toast, ToastType } from "../../stores/toastStore";

const DURATION: Record<ToastType, number> = {
  error: 6000,
  success: 3000,
  info: 3000,
};

const ICONS: Record<ToastType, LucideIcon> = {
  error: X,
  success: Check,
  info: Info,
};

const STYLES: Record<ToastType, string> = {
  error: "bg-red-500/60 text-neutral",
  success: "bg-green-500/60 text-neutral",
  info: "bg-neutral/60 text-foreground",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), DURATION[toast.type]);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, removeToast]);

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      onClick={() => removeToast(toast.id)}
      className={`flex items-center toast-enter cursor-pointer rounded-md px-3 py-2 text-sm shadow-lg transition-all duration-200 ${STYLES[toast.type]} ${toast.leaving ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"}`}
    >
      <span className="mr-1.5 font-bold inline-flex items-center">
        {(() => {
          const Icon = ICONS[toast.type];
          return <Icon size={14} />;
        })()}
      </span>
      {toast.message}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
