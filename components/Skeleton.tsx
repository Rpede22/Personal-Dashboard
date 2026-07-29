type Props = {
  className?: string;
  width?: number | string;
  height?: number | string;
  rounded?: string;
};

export function Skeleton({ className = "", width, height, rounded }: Props) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;
  if (rounded) style.borderRadius = rounded;
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonRow({ height = 48, className = "" }: { height?: number; className?: string }) {
  return <Skeleton className={className} height={height} rounded="10px" />;
}

export function SkeletonList({ rows = 3, rowHeight = 48, gap = 8 }: { rows?: number; rowHeight?: number; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${gap}px` }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} height={rowHeight} />
      ))}
    </div>
  );
}
