import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { RainbowBar } from './Rainbow';
import { RoundButton } from './RoundButton';
import { captureError, flush } from '@/lib/telemetry';
import { colors } from '@/lib/theme';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Catches render errors anywhere below it, reports them, and shows one button that mounts the app
 * again instead of letting iOS kill the process. No words: a rainbow and a refresh arrow.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError('render', error, { componentStack: info.componentStack?.split('\n').slice(0, 20).join('\n') }, 'fatal');
    void flush();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <RainbowBar height={12} style={{ width: 220 }} />
        <RoundButton icon="refresh" size={88} label="Börja om" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 48 },
});
