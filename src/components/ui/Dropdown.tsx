import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronLeft } from "lucide-react";
import { createPortal } from "react-dom";

export interface DropdownItem {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  separator?: boolean;
  submenu?: DropdownItem[];
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  onOpenChange?: (open: boolean) => void;
}

interface MenuContextValue {
  closeAll: () => void;
}

const MenuContext = createContext<MenuContextValue>({ closeAll: () => { } });

export function Dropdown({ trigger, items, align = "right", onOpenChange }: DropdownProps) {
  const [open, setOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const closeAll = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40 bg-transparent" onClick={closeAll} />
            <MenuContext.Provider value={{ closeAll }}>
              <MenuList
                items={items}
                align={align}
                anchorRef={containerRef}
              />
            </MenuContext.Provider>
          </>,
          document.body,
        )}
    </div>
  );
}

interface MenuListProps {
  items: DropdownItem[];
  align: "left" | "right";
  anchorRef: React.RefObject<HTMLDivElement | null>;
  nested?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function MenuList({
  items,
  align,
  anchorRef,
  nested,
  onMouseEnter,
  onMouseLeave,
}: MenuListProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let top = anchorRect.bottom;

    const leftAligned = anchorRect.left;
    const rightAligned = anchorRect.right - menuRect.width;
    let left: number;

    if (nested) {
      left = anchorRect.left - menuRect.width;
      if (left < 0) left = anchorRect.right;
    } else if (align === "right") {
      left = leftAligned;
      if (left + menuRect.width > viewW) left = rightAligned;
    } else {
      left = rightAligned;
      if (left < 0) left = leftAligned;
    }

    if (left < 0) left = 4;
    if (left + menuRect.width > viewW) {
      left = viewW - menuRect.width - 4;
    }

    if (top + menuRect.height > viewH) {
      top = anchorRect.top - menuRect.height;
    }
    if (top < 0) top = 4;

    setPos({ top, left });
  }, [anchorRef, align, nested]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  return (
    <div
      ref={menuRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed z-50 min-w-40 ${pos ? "visible" : "invisible"}`}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      <div className="relative rounded-md">
        <div className="absolute inset-0 blur-bg rounded-md" />
        <div className="relative px-2 py-1">
          {items.map((item, i) => (
            <MenuItem key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ item }: { item: DropdownItem }) {
  const { closeAll } = useContext(MenuContext);

  if (item.separator) {
    return <hr className="my-1 border-border" />;
  }

  const [submenuOpen, setSubmenuOpen] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const submenuRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (item.disabled) return;
    if (item.submenu) {
      setSubmenuOpen((v) => !v);
      return;
    }
    item.onClick?.();
    closeAll();
  };

  const openSub = () => {
    if (!item.submenu) return;
    clearTimeout(timerRef.current);
    setSubmenuOpen(true);
  };

  const closeSub = () => {
    if (!item.submenu) return;
    timerRef.current = setTimeout(() => setSubmenuOpen(false), 120);
  };

  return (
    <div className="relative" onMouseEnter={openSub} onMouseLeave={closeSub}>
      <button
        ref={itemRef}
        type="button"
        disabled={item.disabled}
        onClick={handleClick}
        className={`flex w-full items-center text-neutral gap-2 px-1 py-1.5 rounded-sm text-left text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${item.danger
          ? "text-red-400 hover:bg-red-500/10"
          : "hover:bg-neutral/20"
          }`}
      >
        {item.icon && <span className="w-4 inline-flex items-center justify-center">{item.icon}</span>}
        <span className="flex-1 truncate">{item.label}</span>
        {item.active && <Check size={14} className="text-accent" />}
        {item.submenu && <ChevronLeft size={14} className="text-muted-foreground -scale-x-100" />}
      </button>

      {item.submenu && submenuOpen && (
        <SubmenuContainer
          subRef={submenuRef}
          items={item.submenu}
          anchorRef={itemRef}
          onMouseEnter={openSub}
          onMouseLeave={closeSub}
        />
      )}
    </div>
  );
}

function SubmenuContainer({
  subRef,
  items,
  anchorRef,
  onMouseEnter,
  onMouseLeave,
}: {
  subRef: React.RefObject<HTMLDivElement | null>;
  items: DropdownItem[];
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = subRef.current;
    if (!anchor || !menu) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = anchorRect.left - menuRect.width;
    if (left < 0) {
      left = anchorRect.right;
      if (left + menuRect.width > viewW) {
        left = viewW - menuRect.width - 4;
      }
    }

    let top = anchorRect.top;
    if (top + menuRect.height > viewH) {
      top = viewH - menuRect.height - 4;
    }
    if (top < 0) top = 4;

    left = left - 10
    setPos({ top, left });
  }, [anchorRef, subRef]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  return (
    <div
      ref={subRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed z-50 min-w-40 ${pos ? "visible" : "invisible"}`}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      <div className="blur-bg rounded-md px-2 bg-neutral-foreground py-1">
        {items.map((item, i) => (
          <MenuItem key={i} item={item} />
        ))}
      </div>
    </div>
  );
}
