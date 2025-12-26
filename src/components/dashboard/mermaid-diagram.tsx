"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  chart: string;
}

// Mermaidを初期化
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "inherit",
});

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      setIsRendering(true);
      setError(null);

      try {
        // ユニークIDを生成
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // コンテナをクリア
        containerRef.current.innerHTML = "";

        // Mermaidでレンダリング
        const { svg } = await mermaid.render(id, chart);
        containerRef.current.innerHTML = svg;
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to render diagram"
        );
      } finally {
        setIsRendering(false);
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive font-medium mb-2">
          Failed to render diagram
        </p>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
          {error}
        </pre>
        <details className="mt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            View raw diagram code
          </summary>
          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="relative">
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="text-sm text-muted-foreground">Loading diagram...</div>
        </div>
      )}
      <div
        ref={containerRef}
        className="overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
      />
    </div>
  );
}
