// Минималистичные stroke-иконки (вместо эмодзи в навигации)

import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

export function HomeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChartIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={13} width={3.6} height={7} rx={1} stroke={color} strokeWidth={1.8} />
      <Rect x={10.2} y={8} width={3.6} height={12} rx={1} stroke={color} strokeWidth={1.8} />
      <Rect x={16.4} y={4} width={3.6} height={16} rx={1} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function GridIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={3.5} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
      <Rect x={13.5} y={3.5} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
      <Rect x={3.5} y={13.5} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
      <Rect x={13.5} y={13.5} width={7} height={7} rx={2} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function AppleIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 8.2c-1.1-1-2.6-1.3-4-.7-1.9.8-2.9 3-2.4 5.4.5 2.4 2 4.7 3.6 5.9 1 .7 2 .5 2.8 0 .8.5 1.8.7 2.8 0 1.6-1.2 3.1-3.5 3.6-5.9.5-2.4-.5-4.6-2.4-5.4-1.4-.6-2.9-.3-4 .7Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12 8.2V5.4M12 5.4c1.4 0 2.4-1 2.6-2.4-1.5-.2-2.6.8-2.6 2.4Z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UserIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.5} r={3.5} stroke={color} strokeWidth={1.8} />
      <Path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function SunIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function BoltIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 3 5 13.5h5L11 21l8-10.5h-5L13 3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FlameIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3s1 2.4 1 4.2c2.4 1.1 5 3.6 5 7.3A6 6 0 0 1 6 14.5C6 9.6 12 8.5 12 3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12 20a3 3 0 0 0 3-3c0-2-1.6-3-3-4.5-1.4 1.5-3 2.5-3 4.5a3 3 0 0 0 3 3Z" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

export function ChevronIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 5 7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CalendarIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5.5} width={16} height={14.5} rx={2} stroke={color} strokeWidth={1.8} />
      <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function TrashIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloseIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6 6 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
