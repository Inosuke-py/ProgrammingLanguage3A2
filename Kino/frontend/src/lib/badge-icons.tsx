import {
  Upload, Play, Flame, Target, Brain, Crown, Shield, Trophy, Heart, Clock,
  Zap, Star, Swords, Users, Moon, Rocket, CheckCircle2, Crosshair, Award,
  RotateCcw, BookOpen, FolderOpen, Library,
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  upload: Upload,
  play: Play,
  flame: Flame,
  target: Target,
  brain: Brain,
  crown: Crown,
  shield: Shield,
  trophy: Trophy,
  heart: Heart,
  clock: Clock,
  bolt: Zap,
  star: Star,
  swords: Swords,
  users: Users,
  moon: Moon,
  rocket: Rocket,
  'check-circle': CheckCircle2,
  crosshair: Crosshair,
  award: Award,
  zap: Zap,
  repeat: RotateCcw,
  book: BookOpen,
  folder: FolderOpen,
  library: Library,
}

export function getBadgeIcon(iconName: string | null | undefined, size: number, style?: React.CSSProperties) {
  const IconComponent = iconName ? iconMap[iconName] : undefined
  if (IconComponent) return <IconComponent size={size} style={style} />
  return <Award size={size} style={style} />
}

export function rarityWeight(rarity: string): number {
  const weights: Record<string, number> = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  }
  return weights[rarity] ?? 0
}
