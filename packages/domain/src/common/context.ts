/**
 * Ambient dependencies the domain needs but must not construct itself.
 * The composition root supplies real implementations; tests supply fixed ones,
 * which keeps every domain rule deterministic and reproducible.
 */
export interface DomainContext {
  /** Returns the current instant. Never call Date.now() inside domain code. */
  now: () => Date;
  /** Returns a new UUID v4 string. */
  newId: () => string;
}
