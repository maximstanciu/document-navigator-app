import { getNetworkStateAsync, NetworkStateType } from 'expo-network';

/**
 * `false` only when the device has no network at all (ANL-10): airplane mode, Wi-Fi and mobile data
 * off. A network the OS couldn't check for internet access still gets a try, and the request itself
 * then fails as `network`. If the state can't be read, the device counts as online for the same reason.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync();
    return state.type !== NetworkStateType.NONE;
  } catch {
    return true;
  }
}
