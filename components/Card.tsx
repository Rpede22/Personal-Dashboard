"use client";

interface CardProps {
  children: React.ReactNode;
  accentColor?: string;
  className?: string;
}

export default function Card({ children, accentColor, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl p-5 transition-all duration-200 group-hover:scale-[1.01] group-hover:brightness-110 ${className}`}
      style={{
        background: accentColor
          ? `linear-gradient(170deg, ${accentColor}1a 0%, var(--surface) 45%)`
          : "var(--surface)",
        border: accentColor ? `2px solid ${accentColor}` : `2px solid var(--border)`,
        borderTop: accentColor ? `3px solid ${accentColor}` : `2px solid var(--border)`,
        boxShadow: accentColor
          ? `0 4px 28px ${accentColor}33`
          : "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  accentColor,
  showArrow = true,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  accentColor?: string;
  showArrow?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-2xl">{icon}</span>
      <div>
        <h2
          className="text-base font-semibold leading-tight"
          style={{ color: accentColor ?? "var(--text)" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {showArrow && (
        <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
          →
        </span>
      )}
    </div>
  );
}
