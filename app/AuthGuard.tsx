"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import axios from "axios";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const publicRoutes = ["/", "/signin", "/register"];

    if (publicRoutes.includes(pathname)) return;

    axios.get("/api/auth/me")
      .catch(() => {
        router.replace("/signin");
      });
  }, [pathname, router]);

  return <>{children}</>;
}