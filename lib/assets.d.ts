// Module declarations for asset types Expo does not type by default. Metro bundles them as assets
// (see metro.config.js for `.riv`); require() yields the asset id that expo-audio and rive-react-native take.
declare module '*.riv' {
  const asset: number;
  export default asset;
}
declare module '*.m4a' {
  const asset: number;
  export default asset;
}
