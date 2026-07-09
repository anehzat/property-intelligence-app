import { cn } from "@/lib/utils"

function scoreColor(score: number) {
  if (score >= 85) return "var(--success)"
  if (score >= 75) return "var(--primary)"
  if (score >= 60) return "var(--warning)"
  return "var(--muted-foreground)"
}

export function ScoreRing({
  score,
  size = 56,
  stroke = 5,
  className,
}: {
  score: number
  size?: number
  stroke?: number
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = scoreColor(score)

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono font-semibold leading-none"
          style={{ color, fontSize: size * 0.28 }}
        >
          {score}
        </span>
      </div>
    </div>
  )
}

export function ScoreBar({
  label,
  value,
  inverse = false,
}: {
  label: string
  value: number
  inverse?: boolean
}) {
  // For risk (inverse), low is good.
  const good = inverse ? 100 - value : value
  const color =
    good >= 80
      ? "var(--success)"
      : good >= 60
        ? "var(--primary)"
        : "var(--warning)"
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
