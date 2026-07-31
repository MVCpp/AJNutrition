import { z } from 'zod';

/**
 * Subscription status (docs/product/subscription.md, phase S-1).
 *
 * Everything here is verified offline against an embedded public key. There is
 * no licence server in S-1 and therefore no outbound request: the practitioner
 * pastes or loads a signed token she was emailed.
 */

/**
 * `suspended` is the issuer switching a licence off before its expiry. It
 * allows exactly what `expired` allows — read-only — and never less.
 */
export const LicenseStateSchema = z.enum(['trial', 'active', 'grace', 'expired', 'suspended']);
export type LicenseState = z.infer<typeof LicenseStateSchema>;

export const LicensePlanSchema = z.enum(['monthly', 'annual', 'perpetual']);

export const LicenseStatusDtoSchema = z
  .object({
    /**
     * False until an issuer public key is compiled in. The whole layer is
     * inert then — nothing is gated and the UI hides itself — so that shipping
     * the machinery cannot expire an app nobody is selling yet.
     */
    enforced: z.boolean(),
    state: LicenseStateSchema,
    /**
     * The only thing a lapsed subscription changes. Reading, exporting,
     * printing, backing up and unlocking are never conditional on it.
     */
    canWrite: z.boolean(),
    holder: z.string().nullable(),
    plan: LicensePlanSchema.nullable(),
    /** Quote this to support; not a secret and not derived from patient data. */
    licenseId: z.string().nullable(),
    /**
     * Random per-install id, stamped on first run. NOT a hardware
     * fingerprint — it says nothing about the machine and nothing about the
     * practice; it exists only to spot one licence on many computers.
     */
    deviceId: z.string().nullable(),
    /** When the current state ends: trial end, licence expiry, or grace end. */
    endsAt: z.string().nullable(),
    daysRemaining: z.number().int().min(0),
    /** A licence file is present but does not verify. */
    invalidToken: z.boolean(),
    clockTampered: z.boolean(),
  })
  .strict();
export type LicenseStatusDto = z.infer<typeof LicenseStatusDtoSchema>;

/**
 * The pasted token. Bounded because it arrives from the renderer: a valid v1
 * licence is roughly 300 characters, so 4 KB is generous while still refusing
 * a paste that could only be an attempt to make the verifier work hard.
 */
export const ActivateLicenseCommandSchema = z
  .object({ token: z.string().trim().min(1, 'required').max(4096, 'too_long') })
  .strict();
export type ActivateLicenseCommand = z.infer<typeof ActivateLicenseCommandSchema>;

export const ActivateLicenseResultDtoSchema = z
  .object({ canceled: z.boolean(), status: LicenseStatusDtoSchema })
  .strict();
export type ActivateLicenseResultDto = z.infer<typeof ActivateLicenseResultDtoSchema>;
