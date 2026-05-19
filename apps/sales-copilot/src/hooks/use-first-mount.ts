import { useRef } from 'react';

// Module-level set of route keys that have been mounted at least once in this
// app session. Resets on full page reload, which is the desired behavior:
// the very first visit per session can animate, subsequent back-navigation
// remounts skip the intro animation to avoid the flicker / replay effect.
const visited = new Set<string>();

/**
 * Returns true the first time a component with the given `key` mounts in the
 * current app session, false on every subsequent mount.
 *
 * Use to gate page-enter animations so React Router back-navigation does not
 * replay the intro stagger every time data refetches and the page remounts:
 *
 *   const firstMount = useFirstMount('home');
 *   <motion.div initial={firstMount ? 'hidden' : false} animate="show" ...>
 */
export function useFirstMount(key: string): boolean {
  const isFirstRef = useRef<boolean | null>(null);
  if (isFirstRef.current === null) {
    isFirstRef.current = !visited.has(key);
    if (isFirstRef.current) {
      visited.add(key);
    }
  }
  return isFirstRef.current;
}
