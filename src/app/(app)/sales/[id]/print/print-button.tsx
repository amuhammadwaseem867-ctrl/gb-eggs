"use client";

import { useEffect } from "react";
import { Printer } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <Button onClick={() => window.print()}>
      <Printer /> Print
    </Button>
  );
}
