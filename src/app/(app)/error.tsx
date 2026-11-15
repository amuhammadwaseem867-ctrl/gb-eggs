"use client";

import { useEffect } from "react";
import { AlertOctagon, RotateCcw } from "@/components/icons";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertOctagon className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error.message || "An unexpected error occurred while loading this page."}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <Button onClick={reset} variant="outline">
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
