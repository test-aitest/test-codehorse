"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export function HeroButtons() {
  return (
    <div className="flex gap-4">
      <Button size="lg" asChild>
        <Link href="/sign-in">Get Started</Link>
      </Button>
      <Button variant="outline" size="lg" asChild>
        <Link href="#features">Learn More</Link>
      </Button>
    </div>
  );
}
