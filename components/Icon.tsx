import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

export type IconName =
  | 'plus'
  | 'mic'
  | 'camera'
  | 'photo'
  | 'check'
  | 'close'
  | 'back'
  | 'send'
  | 'play'
  | 'pause'
  | 'stop'
  | 'pencil'
  | 'unicorn'
  | 'lock'
  | 'refresh'
  | 'wand'
  | 'book'
  | 'crayon'
  | 'undo';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

/** Line icons drawn to a 24-box. Rounded joins so they feel soft. */
export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2.4 }: Props) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'plus' && (
        <>
          <Line x1={12} y1={5} x2={12} y2={19} {...common} />
          <Line x1={5} y1={12} x2={19} y2={12} {...common} />
        </>
      )}
      {name === 'mic' && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...common} />
          <Path d="M5 11a7 7 0 0 0 14 0" {...common} />
          <Line x1={12} y1={18} x2={12} y2={21} {...common} />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3v11H4z" {...common} />
          <Circle cx={12} cy={13} r={3.5} {...common} />
        </>
      )}
      {name === 'photo' && (
        <>
          <Rect x={3.5} y={5} width={17} height={14} rx={2.5} {...common} />
          <Circle cx={9} cy={10} r={1.6} {...common} />
          <Path d="M4 17l5-5 3 3 3-3 5 5" {...common} />
        </>
      )}
      {name === 'refresh' && (
        <>
          <Path d="M20 12a8 8 0 1 1-2.6-5.9" {...common} />
          <Polyline points="20,3 20,8.5 14.5,8.5" {...common} />
        </>
      )}
      {name === 'check' && <Polyline points="5,12.5 10,17.5 19,7" {...common} />}
      {name === 'close' && (
        <>
          <Line x1={6} y1={6} x2={18} y2={18} {...common} />
          <Line x1={18} y1={6} x2={6} y2={18} {...common} />
        </>
      )}
      {name === 'back' && <Polyline points="14,5 7,12 14,19" {...common} />}
      {name === 'send' && (
        <>
          <Line x1={12} y1={19} x2={12} y2={5} {...common} />
          <Polyline points="6,11 12,5 18,11" {...common} />
        </>
      )}
      {name === 'play' && <Path d="M8 5.5v13l10-6.5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />}
      {name === 'pause' && (
        <>
          <Rect x={6.5} y={5} width={4} height={14} rx={1.5} fill={color} />
          <Rect x={13.5} y={5} width={4} height={14} rx={1.5} fill={color} />
        </>
      )}
      {name === 'stop' && <Rect x={6} y={6} width={12} height={12} rx={3} fill={color} />}
      {name === 'pencil' && (
        <>
          <Path d="M4 20l4-1 11-11-3-3L5 16z" {...common} />
          <Line x1={13} y1={8} x2={16} y2={11} {...common} />
        </>
      )}
      {name === 'wand' && (
        <>
          <Line x1={4} y1={20} x2={14.5} y2={9.5} {...common} strokeWidth={strokeWidth + 0.8} />
          <Path d="M17.5 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill={color} stroke={color} strokeWidth={0.6} strokeLinejoin="round" />
          <Circle cx={21} cy={11.5} r={1.4} fill={color} />
          <Circle cx={12.5} cy={4.5} r={1.1} fill={color} />
        </>
      )}
      {name === 'book' && (
        <>
          <Path d="M4 5a2 2 0 0 1 2-2h12.5v15H6a2 2 0 0 0-2 2z" {...common} />
          <Path d="M4 20a2 2 0 0 1 2-2h12.5v3H6a2 2 0 0 1-2-2z" {...common} />
        </>
      )}
      {name === 'crayon' && (
        <>
          <Path d="M7 21l-3-3 11-11 3 3z" {...common} />
          <Path d="M15 7l2.2-2.2a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L18 10" {...common} />
          <Path d="M4 18l-1 4 4-1" {...common} />
        </>
      )}
      {name === 'undo' && (
        <>
          <Path d="M9 7H4v5" {...common} />
          <Path d="M4.5 12a8 8 0 1 1 2.3 5.7" {...common} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x={5} y={11} width={14} height={9} rx={2.5} {...common} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...common} />
        </>
      )}
      {name === 'unicorn' && (
        <>
          <Path d="M13 3l1.5 5" {...common} />
          <Path d="M6 20c0-5 2-8 5.5-10l3-2c2 0 4 2 4 5 0 2-1 3-1 5v2" {...common} />
          <Path d="M10 20v-3" {...common} />
          <Circle cx={14.5} cy={11.5} r={0.9} fill={color} />
          <Path d="M8 12c-2 1-3 3-3 5" {...common} />
        </>
      )}
    </Svg>
  );
}
