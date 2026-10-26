import { TextInput, type TextInputProps } from 'react-native';

/**
 * The one text field she writes in. She writes in capitals (product rule), and
 * `autoCapitalize="characters"` is only a hint to the keyboard: the iPad's ignores it, as does any
 * hardware keyboard. So every change is uppercased here before it reaches a machine, and the
 * hint stays so the on-screen keyboard shows capitals where it can. No autocorrect, no spellcheck.
 */
export function CapsInput({ onChangeText, ...rest }: TextInputProps) {
  return (
    <TextInput
      autoCorrect={false}
      spellCheck={false}
      autoCapitalize="characters"
      autoComplete="off"
      {...rest}
      onChangeText={onChangeText ? (t) => onChangeText(toCaps(t)) : undefined}
    />
  );
}

export const toCaps = (s: string) => s.toUpperCase();
