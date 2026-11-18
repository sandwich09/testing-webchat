import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type VerifyAccessInput = { token: string | null };

export type VerifyAccessDeps = Pick<AllPorts, 'signer' | 'clock'>;

/** Checks the access cookie. Every route that needs a signed-in admin calls it first. */
export const makeVerifyAccess: (
  deps: VerifyAccessDeps,
  config: UseCaseConfig,
) => UseCase<VerifyAccessInput, void, 'access.unauthorized'> =
  ({ signer, clock }) =>
  ({ token }) => {
    if (token === null || !signer.verify(token, clock.now())) {
      return Promise.resolve(err('access.unauthorized'));
    }
    return Promise.resolve(ok(undefined));
  };
