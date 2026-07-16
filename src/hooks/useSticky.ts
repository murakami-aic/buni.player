import { useEffect, useRef, useState } from "react";

export function useSticky() {
    const [isStuck, setIsStuck] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsStuck(!entry.isIntersecting),
            { rootMargin: "0px 0px -1px 0px", threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);


    return [sentinelRef, isStuck] as const;
}