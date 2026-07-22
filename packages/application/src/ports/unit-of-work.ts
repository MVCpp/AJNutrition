/**
 * Transactional boundary. Every state-changing use case runs its work inside
 * `run`, which the SQLite adapter maps to a database transaction: all writes
 * (including audit events for successful actions) commit or roll back together.
 */
export interface UnitOfWork {
  run<T>(work: () => T): T;
}
